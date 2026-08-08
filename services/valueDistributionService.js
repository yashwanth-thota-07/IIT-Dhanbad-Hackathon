const config = require("../config/valueDistributionConfig.js");

function calculateValueDistribution(vegetable, quantityKg, companyPricePerKg) {
    const {
        farmerSharePercentage,
        middlemanFeePerKg,
        transportCostPerKg,
        handlingCostPerKg
    } = config.GLOBAL_VALUES;

    // FARMER PRICE - always a fixed percentage of the company price
    const farmerPricePerKg = companyPricePerKg * (farmerSharePercentage / 100);

    // AGRIOS REMAINING VALUE - everything left after Farmer + Middleman + Transport + Handling
    const agriosRemainingValuePerKg = companyPricePerKg
        - farmerPricePerKg
        - middlemanFeePerKg
        - transportCostPerKg
        - handlingCostPerKg;

    // VIABILITY
    const isViable = agriosRemainingValuePerKg >= 0;

    // TOTALS
    const qty = Number(quantityKg);
    const totals = {
        companyValue: companyPricePerKg * qty,
        farmerPayment: farmerPricePerKg * qty,
        middlemanFee: middlemanFeePerKg * qty,
        transportCost: transportCostPerKg * qty,
        handlingCost: handlingCostPerKg * qty,
        agriosRemainingValue: agriosRemainingValuePerKg * qty,
    };

    return {
        vegetable,
        quantityKg: qty,
        companyPricePerKg,
        farmerSharePercentage,
        farmerPricePerKg,
        middlemanFeePerKg,
        transportCostPerKg,
        handlingCostPerKg,
        agriosRemainingValuePerKg,
        isViable,
        totals,
    };
}

module.exports = { calculateValueDistribution };
