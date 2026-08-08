const mongoose = require("mongoose");

const transportRecordSchema = new mongoose.Schema(
    {
        produceRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "produceRequestModel",
            required: true,
            unique: true, // One transport record per request
        },
        status: {
            type: String,
            enum: ["NOT_STARTED", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED"],
            default: "NOT_STARTED",
        },
    },
    { timestamps: true }
);

transportRecordSchema.methods.toJSON = function () {
    return {
        id: this._id,
        produceRequestId: this.produceRequestId,
        status: this.status,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
    };
};

const transportRecordModel = mongoose.model("transportRecordModel", transportRecordSchema);

module.exports = transportRecordModel;
