const farmerProcurementModel = require("../models/FarmerProcurement.js");
const produceRequestModel = require("../models/ProduceRequest.js");
const { calculateValueDistribution } = require("../services/valueDistributionService.js");

const recordProcurement = async (req, res) => {
    try {
        const requestId = req.params.id;
        const middlemanId = req.user._id;
        const { vegetable, quantityKg, agreedFarmerPricePerKg, farmerName, farmerPhone, farmerLocation } = req.body;

        // 1. Validate inputs
        if (!vegetable || !quantityKg || agreedFarmerPricePerKg === undefined || !farmerName) {
            return res.status(400).json({ message: "vegetable, quantityKg, agreedFarmerPricePerKg, and farmerName are required." });
        }
        if (Number(quantityKg) <= 0 || Number(agreedFarmerPricePerKg) < 0) {
            return res.status(400).json({ message: "Invalid quantity or price." });
        }

        // 2. Fetch request and validate middleman authorization
        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "ProduceRequest not found." });
        }
        if (request.status !== "ACCEPTED") {
            return res.status(400).json({ message: "Procurement can only be recorded for accepted requests." });
        }
        if (request.middleman.toString() !== middlemanId.toString()) {
            return res.status(403).json({ message: "You are not authorized to record procurement for this request." });
        }

        // 3. Verify vegetable exists in request items
        const item = request.items.find(i => i.name.toLowerCase() === vegetable.toLowerCase());
        if (!item) {
            return res.status(400).json({ message: `Vegetable '${vegetable}' is not part of this request.` });
        }

        // 4. Calculate remaining quantity
        const existingProcurements = await farmerProcurementModel.find({ produceRequestId: requestId, vegetable: item.name });
        const procuredQuantityKg = existingProcurements.reduce((sum, p) => sum + p.quantityKg, 0);
        const remainingQuantityKg = item.quantity - procuredQuantityKg;

        if (Number(quantityKg) > remainingQuantityKg) {
            return res.status(400).json({ message: `Procurement quantity exceeds the remaining requirement by ${Number(quantityKg) - remainingQuantityKg} kg.`, remainingQuantityKg });
        }

        // 5. Calculate expected farmer price and check compliance
        const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
        const farmerPricePerKg = calc.farmerPricePerKg;
        
        let priceStatus = "COMPLIANT";
        if (Number(agreedFarmerPricePerKg) < farmerPricePerKg) {
            priceStatus = "BELOW_TARGET";
        }

        // 6. Calculate total farmer payment
        const totalFarmerPayment = Number(quantityKg) * Number(agreedFarmerPricePerKg);

        // 7. Save procurement record
        const record = await farmerProcurementModel.create({
            produceRequestId: requestId,
            middlemanId: middlemanId,
            vegetable: item.name,
            quantityKg: Number(quantityKg),
            agreedFarmerPricePerKg: Number(agreedFarmerPricePerKg),
            totalFarmerPayment,
            farmerName,
            farmerPhone,
            farmerLocation,
            priceStatus
        });

        return res.status(201).json({
            message: "Farmer procurement recorded successfully.",
            record: record.toJSON(),
            insights: {
                actualFarmerPricePerKg: Number(agreedFarmerPricePerKg),
                farmerPricePerKg,
            }
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getProcurementSummary = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "ProduceRequest not found." });
        }
        
        // Ensure only the middleman (or company) can view. We'll allow middleman who accepted it.
        if (req.user.role === "middleman" && request.middleman && request.middleman.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You are not authorized to view this summary." });
        }

        const procurements = await farmerProcurementModel.find({ produceRequestId: requestId });

        const summary = [];

        for (const item of request.items) {
            const itemProcurements = procurements.filter(p => p.vegetable.toLowerCase() === item.name.toLowerCase());
            const procuredQuantityKg = itemProcurements.reduce((sum, p) => sum + p.quantityKg, 0);
            const remainingQuantityKg = item.quantity - procuredQuantityKg;
            const totalFarmerPayment = itemProcurements.reduce((sum, p) => sum + p.totalFarmerPayment, 0);
            
            let averageActualFarmerPricePerKg = 0;
            if (procuredQuantityKg > 0) {
                averageActualFarmerPricePerKg = totalFarmerPayment / procuredQuantityKg;
            }

            const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
            const farmerPricePerKg = calc.farmerPricePerKg;
            
            let priceCompliance = "COMPLIANT";
            if (procuredQuantityKg > 0 && averageActualFarmerPricePerKg < farmerPricePerKg) {
                priceCompliance = "BELOW_TARGET";
            }

            summary.push({
                vegetable: item.name,
                requiredQuantityKg: item.quantity,
                procuredQuantityKg,
                remainingQuantityKg,
                farmerPricePerKg,
                averageActualFarmerPricePerKg,
                totalFarmerPayment,
                priceCompliance
            });
        }

        return res.status(200).json({
            requestId: request._id,
            summary
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getProcurementStatus = async (req, res) => {
    try {
        const requestId = req.params.id;
        const request = await produceRequestModel.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "ProduceRequest not found." });
        }
        
        const role = req.user.role;
        
        // Authorization check
        if (role === "company" && request.company.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "You are not authorized to view this request." });
        }
        if (role === "middleman" && (!request.middleman || request.middleman.toString() !== req.user._id.toString())) {
            return res.status(403).json({ message: "You are not authorized to view this request." });
        }
        
        const procurements = await farmerProcurementModel.find({ produceRequestId: requestId });
        
        const itemsStatus = [];
        let allCompleted = true;
        let anyInProgress = false;

        for (const item of request.items) {
            const itemProcurements = procurements.filter(p => p.vegetable.toLowerCase() === item.name.toLowerCase());
            const procuredQuantityKg = itemProcurements.reduce((sum, p) => sum + p.quantityKg, 0);
            const remainingQuantityKg = Math.max(0, item.quantity - procuredQuantityKg);
            let completionPercentage = (procuredQuantityKg / item.quantity) * 100;
            // Cap at 100% just in case of slight floating point issues, though logic prevents > 100%
            if (completionPercentage > 100) completionPercentage = 100;
            
            let itemStatus = "NOT_STARTED";
            if (procuredQuantityKg >= item.quantity) {
                itemStatus = "PROCUREMENT_COMPLETED";
            } else if (procuredQuantityKg > 0) {
                itemStatus = "PROCUREMENT_IN_PROGRESS";
            }
            
            if (itemStatus !== "PROCUREMENT_COMPLETED") allCompleted = false;
            if (itemStatus === "PROCUREMENT_IN_PROGRESS" || itemStatus === "PROCUREMENT_COMPLETED") anyInProgress = true;

            const itemData = {
                vegetable: item.name,
                requiredQuantityKg: item.quantity,
                procuredQuantityKg,
                remainingQuantityKg,
                completionPercentage,
                status: itemStatus
            };

            // Add role-based details
            if (role === "middleman" || role === "agrios_operator") {
                const totalFarmerPayment = itemProcurements.reduce((sum, p) => sum + p.totalFarmerPayment, 0);
                let averageActualFarmerPricePerKg = 0;
                if (procuredQuantityKg > 0) {
                    averageActualFarmerPricePerKg = totalFarmerPayment / procuredQuantityKg;
                }

                const calc = calculateValueDistribution(item.name, item.quantity, item.companyPricePerKg);
                const farmerPricePerKg = calc.farmerPricePerKg;
                
                let priceCompliance = "COMPLIANT";
                if (procuredQuantityKg > 0 && averageActualFarmerPricePerKg < farmerPricePerKg) {
                    priceCompliance = "BELOW_TARGET";
                }

                itemData.farmerPricePerKg = farmerPricePerKg;
                itemData.averageActualFarmerPricePerKg = averageActualFarmerPricePerKg;
                itemData.priceCompliance = priceCompliance;
                
                if (role === "agrios_operator") {
                    itemData.totalFarmerPayment = totalFarmerPayment;
                    itemData.farmerProcurements = itemProcurements.map(p => p.toJSON());
                }
            }
            
            itemsStatus.push(itemData);
        }

        let overallStatus = "NOT_STARTED";
        if (allCompleted && request.items.length > 0) {
            overallStatus = "PROCUREMENT_COMPLETED";
        } else if (anyInProgress) {
            overallStatus = "PROCUREMENT_IN_PROGRESS";
        }

        return res.status(200).json({
            requestId: request._id,
            overallStatus,
            items: itemsStatus
        });

    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

module.exports = { recordProcurement, getProcurementSummary, getProcurementStatus };
