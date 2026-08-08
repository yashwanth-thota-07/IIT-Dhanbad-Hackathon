const settlementRecordModel = require("../models/SettlementRecord.js");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const transportRecordModel = require("../models/TransportRecord.js");
const VALUE_DISTRIBUTION_CONFIG = require("../config/valueDistributionConfig.js");

const generateSettlement = async (req, res) => {
    try {
        const requestId = req.params.id;

        // 1. Existing checks
        let existingSettlement = await settlementRecordModel.findOne({ produceRequestId: requestId });
        if (existingSettlement) {
            return res.status(400).json({ message: "Settlement already exists for this request.", settlement: existingSettlement });
        }

        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "ProduceRequest not found." });
        }

        // 2. Transport DELIVERED check
        const transportRecord = await transportRecordModel.findOne({ produceRequestId: requestId });
        if (!transportRecord || transportRecord.status !== "DELIVERED") {
            return res.status(400).json({ message: "Settlement cannot be generated until procurement and delivery are completed." });
        }

        // 3. Procurement checks and actual payment computation
        const procurements = await farmerProcurementModel.find({ produceRequestId: requestId });
        const itemsData = [];
        let totals = {
            companyValue: 0,
            farmerPayment: 0,
            middlemanEarnings: 0,
            transportCost: 0,
            handlingCost: 0,
            agriosRemainingValue: 0
        };

        let overallReconciliationDifference = 0;

        for (const item of request.items) {
            const itemProcurements = procurements.filter(p => p.vegetable.toLowerCase() === item.name.toLowerCase());
            const procuredQuantityKg = itemProcurements.reduce((sum, p) => sum + p.quantityKg, 0);

            if (procuredQuantityKg < item.quantity) {
                return res.status(400).json({ message: "Settlement cannot be generated until procurement and delivery are completed. Procurement incomplete for " + item.name });
            }

            const companyValue = item.quantity * item.companyPricePerKg;
            const actualFarmerPayment = itemProcurements.reduce((sum, p) => sum + p.totalFarmerPayment, 0);
            
            const middlemanEarnings = VALUE_DISTRIBUTION_CONFIG.GLOBAL_VALUES.middlemanFeePerKg * procuredQuantityKg;
            const transportCost = VALUE_DISTRIBUTION_CONFIG.GLOBAL_VALUES.transportCostPerKg * procuredQuantityKg;
            const handlingCost = VALUE_DISTRIBUTION_CONFIG.GLOBAL_VALUES.handlingCostPerKg * procuredQuantityKg;
            
            const allocated = actualFarmerPayment + middlemanEarnings + transportCost + handlingCost;
            const agriosRemainingValue = companyValue - allocated;

            const reconciliationDifference = companyValue - allocated - agriosRemainingValue;

            const itemData = {
                vegetable: item.name,
                quantityKg: procuredQuantityKg,
                companyValue,
                actualFarmerPayment,
                middlemanEarnings,
                transportCost,
                handlingCost,
                agriosRemainingValue,
                reconciliationStatus: reconciliationDifference === 0 ? "RECONCILED" : "MISMATCH"
            };

            itemsData.push(itemData);

            totals.companyValue += companyValue;
            totals.farmerPayment += actualFarmerPayment;
            totals.middlemanEarnings += middlemanEarnings;
            totals.transportCost += transportCost;
            totals.handlingCost += handlingCost;
            totals.agriosRemainingValue += agriosRemainingValue;
            
            overallReconciliationDifference += reconciliationDifference;
        }

        const overallStatus = overallReconciliationDifference === 0 ? "RECONCILED" : "MISMATCH";

        const settlement = await settlementRecordModel.create({
            produceRequestId: requestId,
            items: itemsData,
            totals,
            reconciliationDifference: overallReconciliationDifference,
            status: overallStatus
        });

        return res.status(201).json({
            message: "Settlement generated successfully",
            settlement: settlement.toJSON()
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getSettlement = async (req, res) => {
    try {
        const requestId = req.params.id;
        const settlement = await settlementRecordModel.findOne({ produceRequestId: requestId });
        
        if (!settlement) {
            return res.status(404).json({ message: "Settlement not found." });
        }

        const request = await produceRequestModel.findById(requestId);
        const role = req.user.role;
        
        // Authorization check
        if (role === "company" && request.company.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You are not authorized to view this settlement." });
        }
        if (role === "middleman" && (!request.middleman || request.middleman.toString() !== req.user._id.toString())) {
            return res.status(403).json({ message: "You are not authorized to view this settlement." });
        }

        let responseData = {
            requestId: request._id,
            status: settlement.status
        };

        if (role === "company") {
            responseData.totals = {
                companyValue: settlement.totals.companyValue
            };
            responseData.items = settlement.items.map(i => ({
                vegetable: i.vegetable,
                quantityKg: i.quantityKg,
                companyValue: i.companyValue
            }));
        } else if (role === "middleman") {
            responseData.totals = {
                middlemanEarnings: settlement.totals.middlemanEarnings
            };
            responseData.items = settlement.items.map(i => ({
                vegetable: i.vegetable,
                quantityKg: i.quantityKg,
                middlemanEarnings: i.middlemanEarnings
            }));
        } else if (role === "agrios_operator") {
            responseData = {
                ...responseData,
                totals: settlement.totals,
                items: settlement.items,
                reconciliationDifference: settlement.reconciliationDifference,
                generatedAt: settlement.generatedAt
            };
        }

        return res.status(200).json(responseData);

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { generateSettlement, getSettlement };
