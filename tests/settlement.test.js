const assert = require("assert");
const mongoose = require("mongoose");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const transportRecordModel = require("../models/TransportRecord.js");
const settlementRecordModel = require("../models/SettlementRecord.js");
const { generateSettlement, getSettlement } = require("../controllers/settlementController.js");

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
let mockTransportRecord = null;
let mockSettlementRecord = null;

farmerProcurementModel.find = async (query) => {
    return mockProcurements.filter(p => query.produceRequestId === p.produceRequestId);
};

transportRecordModel.findOne = async (query) => {
    return mockTransportRecord && mockTransportRecord.produceRequestId === query.produceRequestId ? mockTransportRecord : null;
};

settlementRecordModel.findOne = async (query) => {
    return mockSettlementRecord && mockSettlementRecord.produceRequestId === query.produceRequestId ? mockSettlementRecord : null;
};

settlementRecordModel.create = async (data) => {
    mockSettlementRecord = {
        _id: new mongoose.Types.ObjectId(),
        ...data,
        toJSON: function() { return this; }
    };
    return mockSettlementRecord;
};

(async () => {
    try {
        console.log("Running Settlement tests...");
        
        const companyId = new mongoose.Types.ObjectId();
        const middlemanId = new mongoose.Types.ObjectId();
        
        const mockRequest = {
            _id: "req123",
            company: companyId,
            middleman: middlemanId,
            items: [
                { name: "Tomato", quantity: 10000, companyPricePerKg: 40 }
            ],
            toJSON: function() { return this; }
        };
        
        produceRequestModel.findById = async (id) => (id === mockRequest._id ? mockRequest : null);

        const companyUser = { _id: companyId, role: "company" };
        const middlemanUser = { _id: middlemanId, role: "middleman" };
        const operatorUser = { _id: new mongoose.Types.ObjectId(), role: "agrios_operator" };
        
        // TEST 3: Rejection when procurement is incomplete
        mockProcurements = [
            { produceRequestId: "req123", vegetable: "Tomato", quantityKg: 5000, totalFarmerPayment: 100000 }
        ];
        mockTransportRecord = { produceRequestId: "req123", status: "DELIVERED" };
        
        let req = mockReq(operatorUser);
        let res = mockRes();
        await generateSettlement(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.data.message.includes("Procurement incomplete"));
        console.log("TEST 3 Passed: Rejected incomplete procurement");

        // TEST 4: Rejection when transport is not DELIVERED
        mockProcurements.push({ produceRequestId: "req123", vegetable: "Tomato", quantityKg: 5000, totalFarmerPayment: 100000 }); // Now 10000 total
        mockTransportRecord.status = "DISPATCHED";
        
        req = mockReq(operatorUser);
        res = mockRes();
        await generateSettlement(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.data.message.includes("delivery"));
        console.log("TEST 4 Passed: Rejected when transport not DELIVERED");

        // TEST 1: Success calculation and 0-balance reconciliation using target farmer prices
        mockTransportRecord.status = "DELIVERED";
        req = mockReq(operatorUser);
        res = mockRes();
        await generateSettlement(req, res);
        
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.settlement.status, "RECONCILED");
        assert.strictEqual(res.data.settlement.reconciliationDifference, 0);
        assert.strictEqual(res.data.settlement.totals.companyValue, 400000);
        assert.strictEqual(res.data.settlement.totals.farmerPayment, 200000); // 100000 + 100000
        assert.strictEqual(res.data.settlement.totals.middlemanEarnings, 20000); // 2/kg
        assert.strictEqual(res.data.settlement.totals.transportCost, 10000); // 1/kg
        assert.strictEqual(res.data.settlement.totals.handlingCost, 10000); // 1/kg
        assert.strictEqual(res.data.settlement.totals.agriosRemainingValue, 160000); // 400k - (200k+20k+10k+10k)
        console.log("TEST 1 Passed: Perfect reconciliation with farmer price at 50%");

        // TEST 5: Duplicate settlement
        req = mockReq(operatorUser);
        res = mockRes();
        await generateSettlement(req, res);
        assert.strictEqual(res.statusCode, 400);
        assert.ok(res.data.message.includes("already exists"));
        console.log("TEST 5 Passed: Duplicate settlement blocked");

        // TEST 2: Success calculation and reconciliation using an actual average farmer price BELOW target
        mockSettlementRecord = null; // Reset
        mockProcurements = [
            { produceRequestId: "req123", vegetable: "Tomato", quantityKg: 500, totalFarmerPayment: 10000 },
            { produceRequestId: "req123", vegetable: "Tomato", quantityKg: 1000, totalFarmerPayment: 20000 },
            { produceRequestId: "req123", vegetable: "Tomato", quantityKg: 8500, totalFarmerPayment: 153000 } // Total = 10000 kg, 183000 payment (18.3/kg avg)
        ];
        
        req = mockReq(operatorUser);
        res = mockRes();
        await generateSettlement(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.data.settlement.status, "RECONCILED"); // Must still reconcile!
        assert.strictEqual(res.data.settlement.totals.farmerPayment, 183000);
        assert.strictEqual(res.data.settlement.totals.agriosRemainingValue, 177000); // AgriOS remaining rises because farmer payment fell (400k - 183k - 20k - 10k - 10k)
        console.log("TEST 2 Passed: Reconciliation works even with fluctuating actual farmer payments");

        // Authorization blocks (tests 6 & 7)
        // These are handled by router middleware in express, but we check if the controller itself would handle role-filtered gets correctly
        
        // Middleman Get View
        req = mockReq(middlemanUser);
        res = mockRes();
        await getSettlement(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.totals.middlemanEarnings, 20000);
        assert.strictEqual(res.data.totals.agriosRemainingValue, undefined); // Hidden
        console.log("Middleman View check Passed");

        // Company Get View
        req = mockReq(companyUser);
        res = mockRes();
        await getSettlement(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.totals.companyValue, 400000);
        assert.strictEqual(res.data.totals.middlemanEarnings, undefined); // Hidden
        assert.strictEqual(res.data.totals.agriosRemainingValue, undefined); // Hidden
        console.log("Company View check Passed");

        console.log("All tests passed successfully!");
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
})();
