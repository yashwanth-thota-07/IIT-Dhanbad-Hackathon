const mongoose = require("mongoose");

const produceRequestSchema = new mongoose.Schema(
    {
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users2Model",
            required: true,
        },
        items: [
            {
                name: {
                    type: String,
                    required: true,
                    trim: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: [0.001, "Quantity must be greater than 0"],
                },
                companyPricePerKg: {
                    type: Number,
                    required: true,
                    min: [0.001, "Company price per kg must be greater than 0"],
                },
                qualityGrade: {
                    type: String,
                    enum: ["A", "B", "C"],
                    default: "B",
                }
            },
        ],
        status: {
            type: String,
            enum: ["PENDING_OPERATOR_REVIEW", "OPEN_FOR_MIDDLEMEN", "REJECTED_BY_OPERATOR", "ACCEPTED", "REJECTED", "COMPLETED"],
            default: "PENDING_OPERATOR_REVIEW",
        },
        middleman: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users2Model",
            default: null,
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        rejectionReason: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

produceRequestSchema.methods.toJSON = function () {
    return {
        id: this._id,
        company: this.company,
        items: this.items,
        status: this.status,
        middleman: this.middleman,
        createdAt: this.createdAt,
    };
};

const produceRequestModel = mongoose.model("produceRequestModel", produceRequestSchema);

module.exports = produceRequestModel;
