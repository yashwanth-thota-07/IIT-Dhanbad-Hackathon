const Razorpay = require("razorpay");
const crypto = require("crypto");

const isConfigured = () => {
    const key = process.env.RAZORPAY_KEY_ID || "";
    const secret = process.env.RAZORPAY_KEY_SECRET || "";
    return key.length > 0 && secret.length > 0 && !key.startsWith("your_") && !secret.startsWith("your_");
};

const getRazorpay = () => {
    if (!isConfigured()) {
        throw new Error("Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
    }
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
};

const verifyPaymentSignature = (orderId, paymentId, signature) => {
    const expected = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
    return expected === signature;
};

module.exports = { isConfigured, getRazorpay, verifyPaymentSignature };
