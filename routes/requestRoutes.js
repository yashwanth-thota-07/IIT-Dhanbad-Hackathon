const express = require("express");
const { protect, authorize } = require("../middlewares/authMiddleware.js");
const { createRequest, getPendingRequests, getMyRequests, acceptRequest, rejectRequest, deleteRequest, calculatePriceForRequest, getDealEconomics, getAllRequestsForOperator, getOperatorQueue, activateRequest, operatorRejectRequest, getMyDeals, completeRequest } = require("../controllers/requestController.js");
const { recordProcurement, getProcurementSummary, getProcurementStatus } = require("../controllers/procurementController.js");
const { getTransportSummary, updateTransportStatus } = require("../controllers/transportController.js");
const { generateSettlement, getSettlement } = require("../controllers/settlementController.js");

const router = express.Router();

router.post("/", protect, authorize("company"), createRequest);
router.get("/my", protect, authorize("company"), getMyRequests);
router.get("/operator", protect, authorize("agrios_operator"), getAllRequestsForOperator);
router.get("/operator/queue", protect, authorize("agrios_operator"), getOperatorQueue);
router.post("/:id/activate", protect, authorize("agrios_operator"), activateRequest);
router.post("/:id/operator-reject", protect, authorize("agrios_operator"), operatorRejectRequest);
router.get("/pending", protect, authorize("middleman"), getPendingRequests);
router.get("/my-deals", protect, authorize("middleman"), getMyDeals);
router.post("/accept", protect, authorize("middleman"), acceptRequest);
router.post("/reject", protect, authorize("middleman"), rejectRequest);
router.delete("/:id", protect, authorize("company"), deleteRequest);
router.post("/:id/calculate-price", protect, authorize("agrios_operator"), calculatePriceForRequest);
router.get("/:id/deal", protect, authorize("middleman", "agrios_operator"), getDealEconomics);
router.post("/:id/complete", protect, authorize("agrios_operator"), completeRequest);
router.post("/:id/procurements", protect, authorize("middleman"), recordProcurement);
router.get("/:id/procurements", protect, authorize("middleman"), getProcurementSummary);
router.get("/:id/procurement-status", protect, authorize("company", "middleman", "agrios_operator"), getProcurementStatus);
router.get("/:id/transport", protect, authorize("company", "middleman", "agrios_operator"), getTransportSummary);
router.patch("/:id/transport/status", protect, authorize("agrios_operator"), updateTransportStatus);
router.post("/:id/settlement", protect, authorize("agrios_operator"), generateSettlement);
router.get("/:id/settlement", protect, authorize("company", "middleman", "agrios_operator"), getSettlement);

module.exports = router;
