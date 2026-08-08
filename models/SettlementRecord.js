const mongoose = require("mongoose");

const settlementItemSchema = new mongoose.Schema({
    vegetable: { type: String, required: true },
    quantityKg: { type: Number, required: true },
    companyValue: { type: Number, required: true },
    actualFarmerPayment: { type: Number, required: true },
    middlemanEarnings: { type: Number, required: true },
    transportCost: { type: Number, required: true },
    handlingCost: { type: Number, required: true },
    agriosRemainingValue: { type: Number, required: true },
    reconciliationStatus: { type: String, enum: ["RECONCILED", "MISMATCH"], required: true }
}, { _id: false });

const settlementRecordSchema = new mongoose.Schema(
    {
        produceRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "produceRequestModel",
            required: true,
            unique: true,
        },
        items: [settlementItemSchema],
        totals: {
            companyValue: { type: Number, required: true },
            farmerPayment: { type: Number, required: true },
            middlemanEarnings: { type: Number, required: true },
            transportCost: { type: Number, required: true },
            handlingCost: { type: Number, required: true },
            agriosRemainingValue: { type: Number, required: true },
        },
        reconciliationDifference: { type: Number, required: true },
        status: {
            type: String,
            enum: ["PENDING", "GENERATED", "RECONCILED", "MISMATCH"],
            default: "GENERATED",
        },
        generatedAt: {
            type: Date,
            default: Date.now,
        }
    },
    { timestamps: true }
);

settlementRecordSchema.methods.toJSON = function () {
    return {
        id: this._id,
        produceRequestId: this.produceRequestId,
        items: this.items,
        totals: this.totals,
        reconciliationDifference: this.reconciliationDifference,
        status: this.status,
        generatedAt: this.generatedAt,
    };
};

const settlementRecordModel = mongoose.model("settlementRecordModel", settlementRecordSchema);

module.exports = settlementRecordModel;
