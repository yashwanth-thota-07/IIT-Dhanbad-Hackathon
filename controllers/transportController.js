const transportRecordModel = require("../models/TransportRecord.js");
const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const VALUE_DISTRIBUTION_CONFIG = require("../config/valueDistributionConfig.js");

const getTransportSummary = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "ProduceRequest not found." });
        }

        const role = req.user.role;
        
        // Authorization check
        if (role === "company" && request.company.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You are not authorized to view this transport summary." });
        }
        if (role === "middleman" && (!request.middleman || request.middleman.toString() !== req.user._id.toString())) {
            return res.status(403).json({ message: "You are not authorized to view this transport summary." });
        }

        // Fetch Procurements to calculate quantities
        const procurements = await farmerProcurementModel.find({ produceRequestId: requestId });
        let totalRequiredQuantityKg = 0;
        let totalProcuredQuantityKg = 0;

        const items = [];
        let allProcured = true;

        for (const item of request.items) {
            const itemProcurements = procurements.filter(p => p.vegetable.toLowerCase() === item.name.toLowerCase());
            const procuredQuantityKg = itemProcurements.reduce((sum, p) => sum + p.quantityKg, 0);
            
            totalRequiredQuantityKg += item.quantity;
            totalProcuredQuantityKg += procuredQuantityKg;

            if (procuredQuantityKg < item.quantity) {
                allProcured = false;
            }

            const itemData = {
                vegetable: item.name,
                requiredQuantityKg: item.quantity,
                procuredQuantityKg: procuredQuantityKg,
            };

            // Calculate costs for Operator
            if (role === "agrios_operator") {
                const transportCostPerKg = VALUE_DISTRIBUTION_CONFIG.GLOBAL_VALUES.transportCostPerKg;
                itemData.transportCostPerKg = transportCostPerKg;
                itemData.estimatedTransportCostForRequiredQuantity = item.quantity * transportCostPerKg;
                itemData.estimatedTransportCostForProcuredQuantity = procuredQuantityKg * transportCostPerKg;
            }
            
            items.push(itemData);
        }

        // Determine if procurement is completely done
        const isProcurementCompleted = request.items.length > 0 && allProcured;

        // Fetch or create Transport Record
        let transportRecord = await transportRecordModel.findOne({ produceRequestId: requestId });
        if (!transportRecord) {
            transportRecord = await transportRecordModel.create({ produceRequestId: requestId });
        }

        // Auto-transition to READY_FOR_DISPATCH
        if (isProcurementCompleted && transportRecord.status === "NOT_STARTED") {
            transportRecord.status = "READY_FOR_DISPATCH";
            await transportRecord.save();
        }

        const responseData = {
            requestId: request._id,
            overallProcurementStatus: isProcurementCompleted ? "PROCUREMENT_COMPLETED" : (totalProcuredQuantityKg > 0 ? "PROCUREMENT_IN_PROGRESS" : "NOT_STARTED"),
            transport: {
                status: transportRecord.status
            }
        };

        if (role === "company") {
            responseData.items = items.map(i => ({
                vegetable: i.vegetable,
                requiredQuantityKg: i.requiredQuantityKg,
                procuredQuantityKg: i.procuredQuantityKg,
                transport: { status: transportRecord.status }
            }));
        } else if (role === "middleman") {
            responseData.items = items.map(i => ({
                vegetable: i.vegetable,
                requiredQuantityKg: i.requiredQuantityKg,
                procuredQuantityKg: i.procuredQuantityKg,
            }));
        } else if (role === "agrios_operator") {
            const transportCostPerKg = VALUE_DISTRIBUTION_CONFIG.GLOBAL_VALUES.transportCostPerKg;
            responseData.transport.transportCostPerKg = transportCostPerKg;
            responseData.transport.requiredQuantityKg = totalRequiredQuantityKg;
            responseData.transport.procuredQuantityKg = totalProcuredQuantityKg;
            responseData.transport.estimatedTransportCostForRequiredQuantity = totalRequiredQuantityKg * transportCostPerKg;
            responseData.transport.estimatedTransportCostForProcuredQuantity = totalProcuredQuantityKg * transportCostPerKg;
            responseData.items = items;
            responseData.totalEstimatedTransportCost = responseData.transport.estimatedTransportCostForProcuredQuantity;
        }

        return res.status(200).json(responseData);

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const updateTransportStatus = async (req, res) => {
    try {
        const requestId = req.params.id;
        const { status } = req.body;

        if (req.user.role !== "agrios_operator") {
            return res.status(403).json({ message: "You are not authorized to update transport status." });
        }

        const validStatuses = ["NOT_STARTED", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid or missing status." });
        }

        let transportRecord = await transportRecordModel.findOne({ produceRequestId: requestId });
        if (!transportRecord) {
            transportRecord = await transportRecordModel.create({ produceRequestId: requestId });
        }

        transportRecord.status = status;
        await transportRecord.save();

        return res.status(200).json({
            message: "Transport status updated successfully",
            transport: transportRecord.toJSON()
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { getTransportSummary, updateTransportStatus };
