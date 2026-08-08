const assert = require("assert");
const { calculateValueDistribution } = require("../services/valueDistributionService.js");

console.log("Running valueDistribution tests...");

try {
    // TEST 1: Tomato, 10000kg, 40/kg
    // Farmer = 50% = 20/kg, Middleman = 2/kg, Transport = 1/kg, Handling = 1/kg
    // AgriOS remaining = 40 - 20 - 2 - 1 - 1 = 16/kg
    // isViable = true
    const res1 = calculateValueDistribution("Tomato", 10000, 40);
    assert.strictEqual(res1.farmerSharePercentage, 50);
    assert.strictEqual(res1.farmerPricePerKg, 20);
    assert.strictEqual(res1.middlemanFeePerKg, 2);
    assert.strictEqual(res1.transportCostPerKg, 1);
    assert.strictEqual(res1.handlingCostPerKg, 1);
    assert.strictEqual(res1.agriosRemainingValuePerKg, 16);
    assert.strictEqual(res1.isViable, true);
    assert.strictEqual(res1.totals.companyValue, 400000);
    assert.strictEqual(res1.totals.farmerPayment, 200000);
    assert.strictEqual(res1.totals.middlemanFee, 20000);
    assert.strictEqual(res1.totals.transportCost, 10000);
    assert.strictEqual(res1.totals.handlingCost, 10000);
    assert.strictEqual(res1.totals.agriosRemainingValue, 160000);
    console.log("TEST 1 Passed: Standard Tomato distribution");

    // TEST 2: Onion, 5000kg, 30/kg
    const res2 = calculateValueDistribution("Onion", 5000, 30);
    assert.strictEqual(res2.farmerPricePerKg, 15);
    assert.strictEqual(res2.agriosRemainingValuePerKg, 11); // 30 - 15 - 4
    assert.strictEqual(res2.isViable, true);
    console.log("TEST 2 Passed: Onion distribution (no per-vegetable config needed)");

    // TEST 3: Unknown vegetable should now work (no per-vegetable pricing)
    const res3 = calculateValueDistribution("Dragonfruit", 1000, 40);
    assert.strictEqual(res3.farmerPricePerKg, 20);
    assert.strictEqual(res3.isViable, true);
    console.log("TEST 3 Passed: Unknown vegetable works with the simple formula");

    // TEST 4: Company price of 50
    const res4 = calculateValueDistribution("Tomato", 10000, 50);
    assert.strictEqual(res4.farmerPricePerKg, 25);
    assert.strictEqual(res4.agriosRemainingValuePerKg, 21); // 50 - 25 - 4
    assert.strictEqual(res4.isViable, true);
    console.log("TEST 4 Passed: Higher company price distribution");

    // TEST 5: Company price too low to cover farmer + fees
    // Farmer = 5 * 0.5 = 2.5, fees = 4 -> remaining = 5 - 6.5 = -1.5 -> not viable
    const res5 = calculateValueDistribution("Tomato", 10000, 5);
    assert.strictEqual(res5.farmerPricePerKg, 2.5);
    assert.strictEqual(res5.agriosRemainingValuePerKg, -1.5);
    assert.strictEqual(res5.isViable, false);
    console.log("TEST 5 Passed: Non-viable low company price");

    console.log("All tests passed successfully!");
} catch (error) {
    console.error("Test failed!");
    console.error(error);
    process.exit(1);
}
