const assert = require("assert");
const mongoose = require("mongoose");
const produceRequestModel = require("../models/ProduceRequest.js");
const { getDealEconomics, acceptRequest, rejectRequest } = require("../controllers/requestController.js");
const { calculateValueDistribution } = require("../services/valueDistributionService.js");

// Mock request and response
const mockReq = (body, params, user) => ({
    body: body || {},
    params: params || {},
    user: user || { _id: new mongoose.Types.ObjectId() }
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

// We will test the logic directly using mock data.
// Since getDealEconomics and acceptRequest depend on produceRequestModel.findById, we will mock it.

const mockFindById = (requestDoc) => {
    produceRequestModel.findById = () => {
        return {
            populate: () => Promise.resolve(requestDoc),
            ...requestDoc
        };
    };
    produceRequestModel.findById = () => Promise.resolve({
        populate: () => Promise.resolve(requestDoc),
        ...requestDoc
    });
};

(async () => {
    try {
        console.log("Running Middleman Deal Economics tests...");
        
        // TEST 1: Deal Economics format and Viability (Tomato + Onion)
        const mockRequest1 = {
            _id: new mongoose.Types.ObjectId(),
            populate: async function() { return this; },
            company: { name: "Test Company" },
            status: "OPEN_FOR_MIDDLEMEN",
            items: [
                { name: "Tomato", quantity: 10000, companyPricePerKg: 40 },
                { name: "Onion", quantity: 5000, companyPricePerKg: 35 }
            ],
            save: async function() { this.saved = true; },
            toJSON: function() { return this; }
        };
        
        // Overwrite populate behavior specifically for this test
        produceRequestModel.findById = (id) => mockRequest1;
        
        let req = mockReq({}, { id: mockRequest1._id.toString() });
        let res = mockRes();
        await getDealEconomics(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.items.length, 2);
        assert.strictEqual(res.data.items[0].vegetable, "Tomato");
        assert.strictEqual(res.data.items[0].estimatedMiddlemanEarnings, 20000); // 2/kg * 10000
        assert.strictEqual(res.data.items[1].vegetable, "Onion");
        assert.strictEqual(res.data.items[1].estimatedMiddlemanEarnings, 10000); // 2/kg * 5000
        assert.strictEqual(res.data.summary.totalEstimatedMiddlemanEarnings, 30000);
        assert.strictEqual(res.data.summary.isViable, true);
        console.log("TEST 1 Passed: Deal economics and total earnings correctly calculated");

        // TEST 2: Accept Viable Request
        req = mockReq({ requestId: mockRequest1._id.toString() });
        res = mockRes();
        await acceptRequest(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(mockRequest1.status, "ACCEPTED");
        assert.ok(mockRequest1.acceptedAt);
        console.log("TEST 2 Passed: Middleman can accept a viable deal");

        // TEST 3: Reject Unviable Request
        const mockRequest2 = {
            _id: new mongoose.Types.ObjectId(),
            status: "OPEN_FOR_MIDDLEMEN",
            items: [
                { name: "Tomato", quantity: 10000, companyPricePerKg: 5 } // Unviable: farmer 2.5 + fees 4 = 6.5 > 5
            ],
            save: async function() { this.saved = true; },
            toJSON: function() { return this; }
        };
        produceRequestModel.findById = (id) => mockRequest2;
        
        req = mockReq({ requestId: mockRequest2._id.toString() });
        res = mockRes();
        await acceptRequest(req, res);
        
        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.data.message, "Deal is currently not economically viable.");
        assert.strictEqual(mockRequest2.status, "OPEN_FOR_MIDDLEMEN"); // Should not have changed
        console.log("TEST 3 Passed: Middleman cannot accept an unviable deal");

        // TEST 4: Rejection flow with reason
        req = mockReq({ requestId: mockRequest2._id.toString(), rejectionReason: "Price too low" });
        res = mockRes();
        await rejectRequest(req, res);
        
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(mockRequest2.status, "REJECTED");
        assert.strictEqual(mockRequest2.rejectionReason, "Price too low");
        console.log("TEST 4 Passed: Middleman can reject and optionally specify a reason");

        console.log("All tests passed successfully!");
    } catch (err) {
        console.error("Test failed:", err);
        process.exit(1);
    }
})();
