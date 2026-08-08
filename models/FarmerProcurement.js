const mongoose = require("mongoose");

const farmerProcurementSchema = new mongoose.Schema(
    {
        produceRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "produceRequestModel",
            required: true,
        },
        middlemanId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users2Model",
            required: true,
        },
        vegetable: {
            type: String,
            required: true,
            trim: true,
        },
        quantityKg: {
            type: Number,
            required: true,
            min: [0.001, "Quantity must be greater than 0"],
        },
        agreedFarmerPricePerKg: {
            type: Number,
            required: true,
            min: [0, "Agreed farmer price cannot be negative"],
        },
        totalFarmerPayment: {
            type: Number,
            required: true,
        },
        farmerName: {
            type: String,
            required: true,
            trim: true,
        },
        farmerPhone: {
            type: String,
            trim: true,
            default: null,
        },
        farmerLocation: {
            type: String,
            trim: true,
            default: null,
        },
        status: {
            type: String,
            enum: ["RECORDED", "VERIFIED", "CANCELLED"],
            default: "RECORDED",
        },
        priceStatus: {
            type: String,
            enum: ["COMPLIANT", "BELOW_TARGET"],
            required: true,
        }
    },
    { timestamps: true }
);

farmerProcurementSchema.methods.toJSON = function () {
    return {
        id: this._id,
        produceRequestId: this.produceRequestId,
        middlemanId: this.middlemanId,
        vegetable: this.vegetable,
        quantityKg: this.quantityKg,
        agreedFarmerPricePerKg: this.agreedFarmerPricePerKg,
        totalFarmerPayment: this.totalFarmerPayment,
        farmerName: this.farmerName,
        farmerPhone: this.farmerPhone,
        farmerLocation: this.farmerLocation,
        status: this.status,
        priceStatus: this.priceStatus,
        createdAt: this.createdAt,
    };
};

const farmerProcurementModel = mongoose.model("farmerProcurementModel", farmerProcurementSchema);

module.exports = farmerProcurementModel;
