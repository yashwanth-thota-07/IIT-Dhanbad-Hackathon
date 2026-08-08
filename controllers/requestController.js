const produceRequestModel = require("../models/ProduceRequest.js");
const farmerProcurementModel = require("../models/FarmerProcurement.js");
const { calculateValueDistribution } = require("../services/valueDistributionService.js");

const createRequest = async (req, res) => {
    try {
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "Items list is required and cannot be empty" });
        }

        // Validate items
        const preparedItems = [];
        for (const item of items) {
            if (!item.name || !item.quantity || !item.companyPricePerKg) {
                return res.status(400).json({ message: "Each item must have a name, quantity, and companyPricePerKg" });
            }
            
            preparedItems.push({
                name: item.name,
                quantity: Number(item.quantity),
                companyPricePerKg: Number(item.companyPricePerKg),
                qualityGrade: item.qualityGrade || "B"
            });
        }

        const request = await produceRequestModel.create({
            company: req.user._id,
            items: preparedItems,
            status: "PENDING_OPERATOR_REVIEW"
        });

        return res.status(201).json({
            message: "Request posted successfully",
            request: request.toJSON(),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getPendingRequests = async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        const filter = { status: "OPEN_FOR_MIDDLEMEN" };

        const skip = (Number(page) - 1) * Number(limit);
        const [requests, total] = await Promise.all([
            produceRequestModel
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate("company", "name email"),
            produceRequestModel.countDocuments(filter),
        ]);

        return res.status(200).json({
            count: requests.length,
            total,
            page: Number(page),
            pages: Math.ceil(total / Number(limit)),
            requests: requests.map((r) => ({
                id: r._id,
                // Company price is internal AgriOS economics - hidden from middlemen
                items: r.items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    qualityGrade: item.qualityGrade,
                })),
                status: r.status,
                company: r.company ? { name: r.company.name, email: r.company.email } : null,
                createdAt: r.createdAt,
            })),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getMyRequests = async (req, res) => {
    try {
        const requests = await produceRequestModel
            .find({ company: req.user._id })
            .populate("middleman", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: requests.length, 
            requests: requests.map((r) => ({
                id: r._id,
                items: r.items,
                status: r.status,
                middleman: r.middleman ? { name: r.middleman.name, email: r.middleman.email } : null,
                createdAt: r.createdAt,
            }))
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const acceptRequest = async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ message: "requestId is required" });

        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.status !== "OPEN_FOR_MIDDLEMEN") {
            return res.status(400).json({ message: "This opportunity is not open for middlemen." });
        }

        // Check if any item in the request is not viable
        let isViable = true;
        for (const item of request.items) {
            try {
                const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
                if (!calc.isViable) {
                    isViable = false;
                    break;
                }
            } catch (err) {
                isViable = false;
                break;
            }
        }

        if (!isViable) {
            return res.status(400).json({ message: "Deal is currently not economically viable." });
        }

        request.status = "ACCEPTED";
        request.middleman = req.user._id;
        request.acceptedAt = new Date();
        await request.save();

        return res.status(200).json({ message: "Request accepted successfully", request: request.toJSON() });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const rejectRequest = async (req, res) => {
    try {
        const { requestId, rejectionReason } = req.body;
        if (!requestId) return res.status(400).json({ message: "requestId is required" });

        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.status !== "OPEN_FOR_MIDDLEMEN") {
            return res.status(400).json({ message: "This opportunity is not open for middlemen." });
        }

        request.status = "REJECTED";
        request.middleman = req.user._id;
        if (rejectionReason) {
            request.rejectionReason = rejectionReason;
        }
        await request.save();

        return res.status(200).json({ message: "Request rejected successfully", request: request.toJSON() });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const deleteRequest = async (req, res) => {
    try {
        const request = await produceRequestModel.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.company.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You can only delete your own requests" });
        }

        await request.deleteOne();
        return res.status(200).json({ message: "Request deleted successfully" });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const calculatePriceForRequest = async (req, res) => {
    try {
        const request = await produceRequestModel.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        const calculations = [];
        for (const item of request.items) {
            try {
                const calc = calculateValueDistribution(
                    item.name,
                    item.quantity,
                    item.companyPricePerKg
                );
                calculations.push(calc);
            } catch (err) {
                calculations.push({
                    vegetable: item.name,
                    error: err.message
                });
            }
        }

        return res.status(200).json({
            requestId: request._id,
            calculations
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getDealEconomics = async (req, res) => {
    try {
        const request = await produceRequestModel.findById(req.params.id).populate("company", "name");
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        // Middlemen can only view open opportunities or deals they have accepted.
        if (req.user && req.user.role === "middleman") {
            const isOpen = request.status === "OPEN_FOR_MIDDLEMEN";
            const isOwnAccepted = request.status === "ACCEPTED" && request.middleman && request.middleman.toString() === req.user._id.toString();
            if (!isOpen && !isOwnAccepted) {
                return res.status(403).json({ message: "You are not authorized to view this deal." });
            }
        }
        
        let totalEstimatedMiddlemanEarnings = 0;
        let overallViable = true;
        const itemEconomics = [];

        for (const item of request.items) {
            try {
                const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
                totalEstimatedMiddlemanEarnings += calc.totals.middlemanFee;
                if (!calc.isViable) overallViable = false;

                const role = req.user ? req.user.role : "middleman";
                const isOperator = role === "agrios_operator";

                itemEconomics.push({
                    vegetable: calc.vegetable,
                    quantityKg: calc.quantityKg,
                    farmerPricePerKg: calc.farmerPricePerKg,
                    middlemanFeePerKg: calc.middlemanFeePerKg,
                    estimatedMiddlemanEarnings: calc.totals.middlemanFee,
                    isViable: calc.isViable,
                    // Internal metrics
                    ...(isOperator && {
                        companyPricePerKg: calc.companyPricePerKg,
                        transportCostPerKg: calc.transportCostPerKg,
                        handlingCostPerKg: calc.handlingCostPerKg,
                        agriosRemainingValuePerKg: calc.agriosRemainingValuePerKg
                    })
                });
            } catch (err) {
                overallViable = false;
                itemEconomics.push({
                    vegetable: item.name,
                    error: err.message,
                    isViable: false
                });
            }
        }

        return res.status(200).json({
            requestId: request._id,
            companyName: request.company ? request.company.name : "Unknown",
            status: request.status,
            createdAt: request.createdAt,
            items: itemEconomics,
            summary: {
                totalEstimatedMiddlemanEarnings,
                isViable: overallViable
            }
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getAllRequestsForOperator = async (req, res) => {
    try {
        const requests = await produceRequestModel
            .find({})
            .populate("company", "name email")
            .populate("middleman", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: requests.length,
            requests: requests.map((r) => ({
                id: r._id,
                items: r.items,
                status: r.status,
                company: r.company ? { name: r.company.name, email: r.company.email } : null,
                middleman: r.middleman ? { name: r.middleman.name, email: r.middleman.email } : null,
                rejectionReason: r.rejectionReason || null,
                createdAt: r.createdAt,
            })),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getOperatorQueue = async (req, res) => {
    try {
        const requests = await produceRequestModel
            .find({ status: "PENDING_OPERATOR_REVIEW" })
            .populate("company", "name email")
            .sort({ createdAt: -1 });

        const queue = requests.map((r) => {
            const items = r.items.map((item) => {
                try {
                    const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
                    return {
                        name: item.name,
                        quantity: item.quantity,
                        qualityGrade: item.qualityGrade,
                        companyPricePerKg: item.companyPricePerKg,
                        ...calc,
                    };
                } catch (err) {
                    return {
                        name: item.name,
                        quantity: item.quantity,
                        qualityGrade: item.qualityGrade,
                        companyPricePerKg: item.companyPricePerKg,
                        error: err.message,
                    };
                }
            });
            return {
                id: r._id,
                company: r.company ? { name: r.company.name, email: r.company.email } : null,
                items,
                status: r.status,
                createdAt: r.createdAt,
            };
        });

        return res.status(200).json({
            count: queue.length,
            requests: queue,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const activateRequest = async (req, res) => {
    try {
        const request = await produceRequestModel.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.status !== "PENDING_OPERATOR_REVIEW") {
            return res.status(400).json({ message: "Only requests pending operator review can be activated." });
        }

        let isViable = true;
        for (const item of request.items) {
            try {
                const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
                if (!calc.isViable) {
                    isViable = false;
                    break;
                }
            } catch (err) {
                isViable = false;
                break;
            }
        }

        if (!isViable) {
            return res.status(400).json({ message: "Deal is currently not economically viable." });
        }

        request.status = "OPEN_FOR_MIDDLEMEN";
        await request.save();

        return res.status(200).json({ message: "Opportunity activated and open for middlemen", request: request.toJSON() });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const operatorRejectRequest = async (req, res) => {
    try {
        const request = await produceRequestModel.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.status !== "PENDING_OPERATOR_REVIEW") {
            return res.status(400).json({ message: "Only requests pending operator review can be rejected." });
        }

        request.status = "REJECTED_BY_OPERATOR";
        if (req.body.rejectionReason) {
            request.rejectionReason = req.body.rejectionReason;
        }
        await request.save();

        return res.status(200).json({ message: "Request rejected by operator", request: request.toJSON() });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getMyDeals = async (req, res) => {
    try {
        const deals = await produceRequestModel
            .find({ middleman: req.user._id, status: { $in: ["ACCEPTED", "COMPLETED"] } })
            .populate("company", "name")
            .sort({ acceptedAt: -1 });

        const result = [];
        for (const deal of deals) {
            const procurements = await farmerProcurementModel.find({ produceRequestId: deal._id });

            let totalEstimatedEarnings = 0;
            const items = deal.items.map((item) => {
                const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
                const procuredQuantityKg = procurements
                    .filter((p) => p.vegetable.toLowerCase() === item.name.toLowerCase())
                    .reduce((sum, p) => sum + p.quantityKg, 0);

                const estimatedMiddlemanEarnings = calc.totals.middlemanFee;
                totalEstimatedEarnings += estimatedMiddlemanEarnings;

                return {
                    vegetable: item.name,
                    qualityGrade: item.qualityGrade,
                    requiredQuantityKg: item.quantity,
                    procuredQuantityKg,
                    remainingQuantityKg: Math.max(0, item.quantity - procuredQuantityKg),
                    farmerPricePerKg: calc.farmerPricePerKg,
                    middlemanFeePerKg: calc.middlemanFeePerKg,
                    estimatedMiddlemanEarnings,
                };
            });

            result.push({
                id: deal._id,
                status: deal.status,
                company: deal.company ? { name: deal.company.name } : null,
                createdAt: deal.createdAt,
                acceptedAt: deal.acceptedAt,
                items,
                totalEstimatedEarnings,
            });
        }

        return res.status(200).json({
            count: result.length,
            deals: result,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const completeRequest = async (req, res) => {
    try {
        const request = await produceRequestModel.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.status !== "ACCEPTED") {
            return res.status(400).json({ message: "Only accepted requests can be marked as completed." });
        }

        request.status = "COMPLETED";
        await request.save();

        return res.status(200).json({ message: "Request marked as completed", request: request.toJSON() });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { createRequest, getPendingRequests, getMyRequests, acceptRequest, rejectRequest, deleteRequest, calculatePriceForRequest, getDealEconomics, getAllRequestsForOperator, getOperatorQueue, activateRequest, operatorRejectRequest, getMyDeals, completeRequest };
