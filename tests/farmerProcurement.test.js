const assert = require("assert");
const mongoose = require("mongoose");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const { recordProcurement, getProcurementSummary } = require("../controllers/procurementController.js");
const { calculateValueDistribution } = require("../services/valueDistributionService.js");

// Mock setup
const mockReq = (body, params, user) => ({
    body: body || {},
    params: params || {},
    user: user || { _id: new mongoose.Types.ObjectId(), role: "middleman" }
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

// State for mock DB
let mockProcurements = [];

farmerProcurementModel.find = async (query) => {
    return mockProcurements.filter(p => {
        if (query.produceRequestId && query.produceRequestId !== p.produceRequestId) return false;
        if (query.vegetable && query.vegetable !== p.vegetable) return false;
        return true;
    });
};

farmerProcurementModel.create = async (data) => {
    const doc = {
        _id: new mongoose.Types.ObjectId(),
        ...data,
        toJSON: function() { return this; }
    };
    mockProcurements.push(doc);
    return doc;
};

(async () => {
    try {
        console.log("Running Farmer Procurement tests...");
        
        const middlemanId = new mongoose.Types.ObjectId();
        const otherMiddlemanId = new mongoose.Types.ObjectId();
        
        const mockRequest = {
            _id: new mongoose.Types.ObjectId().toString(),
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
        
        // Target for Tomato at 40/kg is 20/kg.
        
        // TEST 1: Valid procurement (COMPLIANT)
        let req = mockReq({
            vegetable: "Tomato",
            farmerName: "Farmer A",
            quantityKg: 500,
            agreedFarmerPricePerKg: 20
        }, { id: mockRequest._id }, { _id: middlemanId, role: "middleman" });
        let res = mockRes();
        
        await recordProcurement(req, res);
        
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.record.priceStatus, "COMPLIANT");
        assert.strictEqual(res.data.record.totalFarmerPayment, 10000);
        console.log("TEST 1 Passed: Valid compliant procurement");

        // TEST 2: Another valid procurement, running totals
        req = mockReq({
            vegetable: "Tomato",
            farmerName: "Farmer B",
            quantityKg: 800,
            agreedFarmerPricePerKg: 20
        }, { id: mockRequest._id }, { _id: middlemanId, role: "middleman" });
        res = mockRes();
        await recordProcurement(req, res);
        
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(mockProcurements.length, 2);
        console.log("TEST 2 Passed: Second procurement added successfully");

        // TEST 3: Procurement BELOW_TARGET
        req = mockReq({
            vegetable: "Tomato",
            farmerName: "Farmer C",
            quantityKg: 500,
            agreedFarmerPricePerKg: 18 // Target is 20
        }, { id: mockRequest._id }, { _id: middlemanId, role: "middleman" });
        res = mockRes();
        await recordProcurement(req, res);
        
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.record.priceStatus, "BELOW_TARGET");
        console.log("TEST 3 Passed: Below-target procurement accurately flagged");

        // TEST 4: Exceeding quantity limit
        // Current procured Tomato = 500 + 800 + 500 = 1800. Remaining = 8200
        req = mockReq({
            vegetable: "Tomato",
            farmerName: "Farmer D",
            quantityKg: 8500, // Exceeds by 300
            agreedFarmerPricePerKg: 20
        }, { id: mockRequest._id }, { _id: middlemanId, role: "middleman" });
        res = mockRes();
        await recordProcurement(req, res);
        
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.data.message.includes("exceeds the remaining requirement by 300 kg"));
        console.log("TEST 4 Passed: Quantity limit enforced");

        // TEST 5: Unknown vegetable
        req = mockReq({
            vegetable: "Potato", // Not in request
            farmerName: "Farmer E",
            quantityKg: 100,
            agreedFarmerPricePerKg: 20
        }, { id: mockRequest._id }, { _id: middlemanId, role: "middleman" });
        res = mockRes();
        await recordProcurement(req, res);
        
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.data.message.includes("not part of this request"));
        console.log("TEST 5 Passed: Unknown vegetable rejected");
        
        // TEST 6: Wrong middleman
        req = mockReq({
            vegetable: "Tomato",
            farmerName: "Farmer F",
            quantityKg: 100,
            agreedFarmerPricePerKg: 20
        }, { id: mockRequest._id }, { _id: otherMiddlemanId, role: "middleman" });
        res = mockRes();
        await recordProcurement(req, res);
        
        assert.strictEqual(res.statusCode, 403);
        console.log("TEST 6 Passed: Unauthorized middleman blocked");

        // TEST 7: Test Summary Endpoint
        req = mockReq({}, { id: mockRequest._id }, { _id: middlemanId, role: "middleman" });
        res = mockRes();
        await getProcurementSummary(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        const tomatoSummary = res.data.summary.find(s => s.vegetable === "Tomato");
        assert.ok(tomatoSummary);
        assert.strictEqual(tomatoSummary.requiredQuantityKg, 10000);
        assert.strictEqual(tomatoSummary.procuredQuantityKg, 1800); // 500+800+500
        assert.strictEqual(tomatoSummary.remainingQuantityKg, 8200);
        assert.strictEqual(tomatoSummary.totalFarmerPayment, 35000); // 10000 + 16000 + 9000
        assert.strictEqual(tomatoSummary.priceCompliance, "BELOW_TARGET"); // Average is 35000/1800 = ~19.44, which is < 20
        
        console.log("TEST 7 Passed: Summary correctly calculates running totals and average compliance");

        console.log("All tests passed successfully!");
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
})();
