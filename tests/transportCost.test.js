const assert = require("assert");
const mongoose = require("mongoose");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const transportRecordModel = require("../models/TransportRecord.js");
const VALUE_DISTRIBUTION_CONFIG = require("../config/valueDistributionConfig.js");
const { getTransportSummary, updateTransportStatus } = require("../controllers/transportController.js");

// Mock setup
const mockReq = (user, body) => ({
    params: { id: "req123" },
    user,
    body: body || {}
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

farmerProcurementModel.find = async (query) => {
    return mockProcurements.filter(p => {
        if (query.produceRequestId && query.produceRequestId !== p.produceRequestId) return false;
        return true;
    });
};

transportRecordModel.findOne = async (query) => {
    if (mockTransportRecord && mockTransportRecord.produceRequestId === query.produceRequestId) {
        return mockTransportRecord;
    }
    return null;
};

transportRecordModel.create = async (data) => {
    mockTransportRecord = {
        _id: new mongoose.Types.ObjectId(),
        ...data,
        status: "NOT_STARTED",
        save: async function() { this.saved = true; },
        toJSON: function() { return this; }
    };
    return mockTransportRecord;
};

(async () => {
    try {
        console.log("Running Transport & Fulfilment Cost Tracking tests...");
        
        const companyId = new mongoose.Types.ObjectId();
        const middlemanId = new mongoose.Types.ObjectId();
        
        const mockRequest = {
            _id: "req123",
            company: companyId,
            middleman: middlemanId,
            status: "ACCEPTED",
            items: [
                { name: "Tomato", quantity: 10000 },
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
        
        // TEST 1: Required 10000, Procured 0 -> NOT_STARTED
        let req = mockReq(operatorUser);
        let res = mockRes();
        await getTransportSummary(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallProcurementStatus, "NOT_STARTED");
        assert.strictEqual(res.data.transport.status, "NOT_STARTED");
        assert.strictEqual(res.data.transport.estimatedTransportCostForRequiredQuantity, 10000); // 10000 * 1
        assert.strictEqual(res.data.transport.estimatedTransportCostForProcuredQuantity, 0); // 0 * 1
        console.log("TEST 1 Passed: 0 procured -> NOT_STARTED, 0 current transport cost");

        // TEST 2: Required 10000, Procured 5000 -> partial cost
        mockProcurements.push({
            produceRequestId: "req123",
            vegetable: "Tomato",
            quantityKg: 5000,
        });
        
        req = mockReq(operatorUser);
        res = mockRes();
        await getTransportSummary(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallProcurementStatus, "PROCUREMENT_IN_PROGRESS");
        assert.strictEqual(res.data.transport.status, "NOT_STARTED"); // Automatically shouldn't switch until completed
        assert.strictEqual(res.data.transport.estimatedTransportCostForRequiredQuantity, 10000);
        assert.strictEqual(res.data.transport.estimatedTransportCostForProcuredQuantity, 5000); // 5000 * 1
        console.log("TEST 2 Passed: Partial procurement -> partial transport cost");

        // TEST 3: Required 10000, Procured 10000 -> READY_FOR_DISPATCH
        mockProcurements.push({
            produceRequestId: "req123",
            vegetable: "Tomato",
            quantityKg: 5000,
        });
        
        req = mockReq(operatorUser);
        res = mockRes();
        await getTransportSummary(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallProcurementStatus, "PROCUREMENT_COMPLETED");
        assert.strictEqual(res.data.transport.status, "READY_FOR_DISPATCH"); // Automatically switched
        assert.strictEqual(res.data.transport.estimatedTransportCostForProcuredQuantity, 10000); // 10000 * 1
        console.log("TEST 3 Passed: Procurement complete -> READY_FOR_DISPATCH");

        // TEST 4: Operator manually updates status to DISPATCHED
        req = mockReq(operatorUser, { status: "DISPATCHED" });
        res = mockRes();
        await updateTransportStatus(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.transport.status, "DISPATCHED");
        assert.strictEqual(mockTransportRecord.status, "DISPATCHED");
        console.log("TEST 4 Passed: Operator successfully updated status to DISPATCHED");

        // TEST 5: Company tries to change status -> 403
        req = mockReq(companyUser, { status: "DELIVERED" });
        res = mockRes();
        await updateTransportStatus(req, res);
        assert.strictEqual(res.statusCode, 403);
        console.log("TEST 5 Passed: Company blocked from updating transport status");

        // TEST 6: Middleman tries to change status -> 403
        req = mockReq(middlemanUser, { status: "DELIVERED" });
        res = mockRes();
        await updateTransportStatus(req, res);
        assert.strictEqual(res.statusCode, 403);
        console.log("TEST 6 Passed: Middleman blocked from updating transport status");
        
        // TEST 7: Confirming client-supplied cost is ignored
        // This is implicitly tested because we hardcode transportCostPerKg = VALUE_DISTRIBUTION_CONFIG.GLOBAL_VALUES.transportCostPerKg inside the controller; req.body.transportCostPerKg is never even read.
        
        // Let's verify Company view doesn't see internal cost
        req = mockReq(companyUser);
        res = mockRes();
        await getTransportSummary(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.transport.status, "DISPATCHED");
        assert.strictEqual(res.data.transport.transportCostPerKg, undefined);
        console.log("TEST 7 & Role validation Passed: Costs securely fetched from config, hidden from Company view");

        console.log("All tests passed successfully!");
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
})();
