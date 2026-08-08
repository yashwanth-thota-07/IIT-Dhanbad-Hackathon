const assert = require("assert");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

const users2Model = require("../models/users2.js");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const transportRecordModel = require("../models/TransportRecord.js");
const settlementRecordModel = require("../models/SettlementRecord.js");

const { createRequest, acceptRequest, getDealEconomics, activateRequest, completeRequest } = require("../controllers/requestController.js");
const { recordProcurement, getProcurementStatus } = require("../controllers/procurementController.js");
const { getTransportSummary, updateTransportStatus } = require("../controllers/transportController.js");
const { generateSettlement, getSettlement } = require("../controllers/settlementController.js");

const mockReq = (user, body = {}, params = {}) => ({ user, body, params });
const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

(async () => {
    try {
        console.log("Connecting to database for E2E testing...");
        // Use a dedicated test database so running tests never wipes the app's
        // development data (registered users) in MONGO_URI.
        await mongoose.connect(process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/agrios_test");

        console.log("Cleaning up database...");
        await users2Model.deleteMany({});
        await produceRequestModel.deleteMany({});
        await farmerProcurementModel.deleteMany({});
        await transportRecordModel.deleteMany({});
        await settlementRecordModel.deleteMany({});

        console.log("Creating test users...");
        const company = await users2Model.create({
            name: "ABC Foods", email: "company@abc.com",
            password: "password123", role: "company", active: true
        });

        const middleman = await users2Model.create({
            name: "Demo Procurement Partner", email: "middleman@demo.com",
            password: "password123", role: "middleman", active: true
        });

        const operator = await users2Model.create({
            name: "Demo Operator", email: "operator@demo.com",
            password: "password123", role: "agrios_operator", active: true
        });

        // ==================================================
        // 1. COMPANY CREATES REQUEST
        // ==================================================
        let req = mockReq(company, {
            items: [
                { name: "Tomato", quantity: 10000, companyPricePerKg: 40, qualityRequirements: "Grade A" },
                { name: "Onion", quantity: 5000, companyPricePerKg: 30, qualityRequirements: "Grade A" },
                { name: "Potato", quantity: 3000, companyPricePerKg: 25, qualityRequirements: "Grade A" }
            ],
            deliveryLocation: "Mumbai",
            deliveryDate: new Date(Date.now() + 86400000).toISOString()
        });
        let res = mockRes();
        console.log("Step 1: Calling createRequest...");
        await createRequest(req, res);
        
        console.log("Step 1 response data:", res.data);
        if (res.statusCode !== 201) { console.error("Step 1 Failed with response:", res.data); }
        assert.strictEqual(res.statusCode, 201);
        const requestId = res.data.request.id.toString();
        console.log("Step 1 Passed: Company created ProduceRequest");

        // ==================================================
        // 2. AGRIOS OPERATOR REVIEWS & ACTIVATES THE DEAL
        // ==================================================
        req = mockReq(operator, {}, { id: requestId });
        res = mockRes();
        await activateRequest(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.request.status, "OPEN_FOR_MIDDLEMEN");
        console.log("Step 2 Passed: Operator activated opportunity (OPEN_FOR_MIDDLEMEN)");

        // ==================================================
        // 3. MIDDLEMAN VIEWS & ACCEPTS DEAL
        // ==================================================
        req = mockReq(middleman, {}, { id: requestId });
        res = mockRes();
        await getDealEconomics(req, res);
        assert.strictEqual(res.statusCode, 200);
        
        const tomatoDeal = res.data.items.find(i => i.vegetable === "Tomato");
        assert.strictEqual(tomatoDeal.companyPricePerKg, undefined); // Secure
        assert.strictEqual(tomatoDeal.agriosRemainingValuePerKg, undefined); // Secure
        assert.strictEqual(tomatoDeal.farmerPricePerKg, 20); // 50% of 40
        assert.ok(tomatoDeal.farmerPricePerKg);
        console.log("Step 2a Passed: Middleman deal economics securely fetched");

        req = mockReq(middleman, { requestId: requestId }, { id: requestId });
        res = mockRes();
        await acceptRequest(req, res);
        
        if (res.statusCode !== 200) { console.error("Step 2b Failed with response:", res.data); }
        assert.strictEqual(res.statusCode, 200);
        console.log("Step 2b Passed: Middleman accepted request");

        // ==================================================
        // 3. MIDDLEMAN RECORDS FARMER PROCUREMENT
        // ==================================================
        // Farmer A
        req = mockReq(middleman, {
            vegetable: "Tomato", farmerName: "Farmer A", farmerContact: "1234567890", quantityKg: 5000, agreedFarmerPricePerKg: 20
        }, { id: requestId });
        res = mockRes();
        await recordProcurement(req, res);
        assert.strictEqual(res.statusCode, 201);
        
        // Farmer B
        req = mockReq(middleman, {
            vegetable: "Tomato", farmerName: "Farmer B", farmerContact: "0987654321", quantityKg: 5000, agreedFarmerPricePerKg: 20
        }, { id: requestId });
        res = mockRes();
        await recordProcurement(req, res);
        assert.strictEqual(res.statusCode, 201);
        console.log("Step 3 Passed: Middleman recorded procurement");

        // Check Procurement Status as Operator
        req = mockReq(operator, {}, { id: requestId });
        res = mockRes();
        await getProcurementStatus(req, res);
        assert.strictEqual(res.statusCode, 200);
        
        const tomatoStatus = res.data.items.find(i => i.vegetable === "Tomato");
        assert.strictEqual(tomatoStatus.status, "PROCUREMENT_COMPLETED");
        assert.strictEqual(tomatoStatus.procuredQuantityKg, 10000);
        assert.strictEqual(tomatoStatus.averageActualFarmerPricePerKg, 20);
        console.log("Step 3b Passed: Procurement status calculated correctly");

        // Force Onion & Potato to complete so overall status completes for transport/settlement tests
        await recordProcurement(mockReq(middleman, { vegetable: "Onion", farmerName: "Farmer C", farmerContact: "1", quantityKg: 5000, agreedFarmerPricePerKg: 12 }, { id: requestId }), mockRes());
        await recordProcurement(mockReq(middleman, { vegetable: "Potato", farmerName: "Farmer D", farmerContact: "1", quantityKg: 3000, agreedFarmerPricePerKg: 11 }, { id: requestId }), mockRes());

        // ==================================================
        // 4. TRANSPORT TRACKING
        // ==================================================
        req = mockReq(operator, {}, { id: requestId });
        res = mockRes();
        await getTransportSummary(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.overallProcurementStatus, "PROCUREMENT_COMPLETED");
        assert.strictEqual(res.data.transport.status, "READY_FOR_DISPATCH"); // Auto-transitioned!
        
        const tomatoTransport = res.data.items.find(i => i.vegetable === "Tomato");
        assert.strictEqual(tomatoTransport.estimatedTransportCostForProcuredQuantity, 10000); // 1/kg * 10000
        console.log("Step 4a Passed: Transport accurately initialized to READY_FOR_DISPATCH");

        req = mockReq(operator, { status: "DELIVERED" }, { id: requestId });
        res = mockRes();
        await updateTransportStatus(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.transport.status, "DELIVERED");
        console.log("Step 4b Passed: Operator changed transport to DELIVERED");

        // ==================================================
        // 4c. OPERATOR APPROVES COMPLETION
        // ==================================================
        req = mockReq(operator, {}, { id: requestId });
        res = mockRes();
        await completeRequest(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.request.status, "COMPLETED");
        console.log("Step 4c Passed: Operator approved completion (COMPLETED)");

        // ==================================================
        // 5. FINAL SETTLEMENT
        // ==================================================
        req = mockReq(operator, {}, { id: requestId });
        res = mockRes();
        await generateSettlement(req, res);
        assert.strictEqual(res.statusCode, 201);
        
        const settlement = res.data.settlement;
        assert.strictEqual(settlement.status, "RECONCILED");
        assert.strictEqual(settlement.reconciliationDifference, 0); // Core financial integrity test
        
        const tomatoSettlement = settlement.items.find(i => i.vegetable === "Tomato");
        assert.strictEqual(tomatoSettlement.companyValue, 400000);
        assert.strictEqual(tomatoSettlement.actualFarmerPayment, 200000);
        assert.strictEqual(tomatoSettlement.middlemanEarnings, 20000); // 2/kg
        assert.strictEqual(tomatoSettlement.transportCost, 10000); // 1/kg
        assert.strictEqual(tomatoSettlement.handlingCost, 10000); // 1/kg
        assert.strictEqual(tomatoSettlement.agriosRemainingValue, 160000); // 400k - (200k+20k+10k+10k)
        console.log("Step 5 Passed: Final Settlement generated flawlessly");

        // ==================================================
        // 6. ROLE SECURITY NEGATIVE TESTS
        // ==================================================
        // Company tries to generate settlement -> 403 (Assuming routes protect it, but let's test controller directly)
        // Wait, the router handles auth. To test router auth, we should use supertest. But we are calling controllers directly.
        // Let's test the controller's internal auth (like getSettlement)
        req = mockReq(company, {}, { id: requestId });
        res = mockRes();
        await getSettlement(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.totals.middlemanEarnings, undefined); // Blocked
        assert.strictEqual(res.data.totals.agriosRemainingValue, undefined); // Blocked
        console.log("Step 6a Passed: Company view securely filtered");

        req = mockReq(middleman, {}, { id: requestId });
        res = mockRes();
        await getSettlement(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.totals.companyValue, undefined); // Blocked
        assert.strictEqual(res.data.totals.agriosRemainingValue, undefined); // Blocked
        console.log("Step 6b Passed: Middleman view securely filtered");

        // Duplicate settlement
        req = mockReq(operator, {}, { id: requestId });
        res = mockRes();
        await generateSettlement(req, res);
        assert.strictEqual(res.statusCode, 400); // Duplicate blocked
        console.log("Step 6c Passed: Duplicate settlement blocked");

        console.log("\n========================================");
        console.log("E2E AUDIT COMPLETE: ALL TESTS PASSED!");
        console.log("========================================");
        process.exit(0);

    } catch (err) {
        console.error("E2E Test Failed:", err);
        process.exit(1);
    }
})();
