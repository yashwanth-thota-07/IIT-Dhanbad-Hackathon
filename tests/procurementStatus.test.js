const assert = require("assert");
const mongoose = require("mongoose");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const { getProcurementStatus } = require("../controllers/procurementController.js");
const { calculateValueDistribution } = require("../services/valueDistributionService.js");

// Mock setup
const mockReq = (user) => ({
    params: { id: "req123" },
    user
});

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

let mockProcurements = [];

farmerProcurementModel.find = async (query) => {
    return mockProcurements.filter(p => {
        if (query.produceRequestId && query.produceRequestId !== p.produceRequestId) return false;
        if (query.vegetable && query.vegetable !== p.vegetable) return false;
        return true;
    });
};

(async () => {
    try {
        console.log("Running Procurement Status tests...");
        
        const companyId = new mongoose.Types.ObjectId();
        const middlemanId = new mongoose.Types.ObjectId();
        
        const mockRequest = {
            _id: "req123",
            company: companyId,
            middleman: middlemanId,
            status: "ACCEPTED",
            items: [
                { name: "Tomato", quantity: 10000, companyPricePerKg: 40 },
                { name: "Onion", quantity: 5000, companyPricePerKg: 35 }
            ],
            toJSON: function() { return this; }
        };
        
        produceRequestModel.findById = async (id) => {
            if (id === mockRequest._id) return mockRequest;
            return null;
        };

        const companyUser = { _id: companyId, role: "company" };
        const middlemanUser = { _id: middlemanId, role: "middleman" };
        const operatorUser = { _id: new mongoose.Types.ObjectId(), role: "agrios_operator" };
        
        // TEST 1: NOT_STARTED
        let req = mockReq(middlemanUser);
        let res = mockRes();
        await getProcurementStatus(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallStatus, "NOT_STARTED");
        assert.strictEqual(res.data.items[0].status, "NOT_STARTED");
        console.log("TEST 1 Passed: NOT_STARTED state verified");

        // TEST 2: PROCUREMENT_IN_PROGRESS
        mockProcurements.push({
            produceRequestId: "req123",
            vegetable: "Tomato",
            quantityKg: 5000,
            totalFarmerPayment: 100000, // 5000 * 20
            toJSON: function() { return this; }
        });
        
        req = mockReq(middlemanUser);
        res = mockRes();
        await getProcurementStatus(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallStatus, "PROCUREMENT_IN_PROGRESS");
        assert.strictEqual(res.data.items[0].status, "PROCUREMENT_IN_PROGRESS");
        assert.strictEqual(res.data.items[0].completionPercentage, 50);
        assert.strictEqual(res.data.items[0].remainingQuantityKg, 5000);
        assert.strictEqual(res.data.items[1].status, "NOT_STARTED");
        console.log("TEST 2 Passed: PROCUREMENT_IN_PROGRESS state verified");

        // TEST 3: COMPLETED one, overall IN_PROGRESS (Multi-item)
        mockProcurements.push({
            produceRequestId: "req123",
            vegetable: "Tomato",
            quantityKg: 5000,
            totalFarmerPayment: 90000, // 5000 * 18
            toJSON: function() { return this; }
        });
        
        req = mockReq(middlemanUser);
        res = mockRes();
        await getProcurementStatus(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallStatus, "PROCUREMENT_IN_PROGRESS");
        assert.strictEqual(res.data.items[0].status, "PROCUREMENT_COMPLETED");
        assert.strictEqual(res.data.items[0].completionPercentage, 100);
        assert.strictEqual(res.data.items[0].remainingQuantityKg, 0);
        
        // TEST 5: Weighted average and compliance
        // Tomato total = 100000 + 90000 = 190000. Qty = 10000. Avg = 19/kg. Target = 20/kg.
        assert.strictEqual(res.data.items[0].averageActualFarmerPricePerKg, 19);
        assert.strictEqual(res.data.items[0].priceCompliance, "BELOW_TARGET");
        console.log("TEST 3 & 5 Passed: Multi-item overall status and accurate weighted average / compliance");

        // TEST 4: PROCUREMENT_COMPLETED
        mockProcurements.push({
            produceRequestId: "req123",
            vegetable: "Onion",
            quantityKg: 5000,
            totalFarmerPayment: 87500, // 5000 * 17.5
            toJSON: function() { return this; }
        });
        
        req = mockReq(middlemanUser);
        res = mockRes();
        await getProcurementStatus(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallStatus, "PROCUREMENT_COMPLETED");
        assert.strictEqual(res.data.items[1].status, "PROCUREMENT_COMPLETED");
        console.log("TEST 4 Passed: PROCUREMENT_COMPLETED state verified");

        // TEST 6: Authorization bounds
        // Company view should NOT have internal price data
        req = mockReq(companyUser);
        res = mockRes();
        await getProcurementStatus(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.items[0].farmerPricePerKg, undefined);
        assert.strictEqual(res.data.items[0].priceCompliance, undefined);
        
        // Other company should get 403
        req = mockReq({ _id: new mongoose.Types.ObjectId(), role: "company" });
        res = mockRes();
        await getProcurementStatus(req, res);
        assert.strictEqual(res.statusCode, 403);
        
        // AgriOS Operator should have everything; farmer-improvement metrics were removed with the simplified pricing
        req = mockReq(operatorUser);
        res = mockRes();
        await getProcurementStatus(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.items[0].farmerImprovementPercentage, undefined);
        assert.strictEqual(res.data.items[0].farmerProcurements.length, 2);
        
        console.log("TEST 6 Passed: Role-based visibility and authorization checks");

        console.log("All tests passed successfully!");
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
})();
