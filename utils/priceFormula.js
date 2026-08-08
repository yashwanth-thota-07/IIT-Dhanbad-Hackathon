const CATEGORIES = {
    electronic: { label: "Electronic Waste", ratePerKg: 45 },
    plastic: { label: "Plastic Waste", ratePerKg: 20 },
    paper: { label: "Paper Waste", ratePerKg: 8 },
    metal: { label: "Metal Waste", ratePerKg: 40 },
};

const isValidCategory = (category) => Object.prototype.hasOwnProperty.call(CATEGORIES, category);

const estimatePrice = (category, weight) => {
    if (!isValidCategory(category)) {
        throw new Error("Invalid category");
    }
    if (!weight || Number(weight) <= 0) {
        throw new Error("Weight must be a positive number");
    }
    const rate = CATEGORIES[category].ratePerKg;
    const total = Number(weight) * rate;
    return Math.round(total * 100) / 100;
};

module.exports = { CATEGORIES, isValidCategory, estimatePrice };
