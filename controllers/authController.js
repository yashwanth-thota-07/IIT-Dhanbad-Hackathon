const users2Model = require("../models/users2.js");
const jwt = require("jsonwebtoken");

const signToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || "7d" }
    );
};

const registerUser = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email and password are required" });
        }

        if (role && !["middleman", "company", "agrios_operator"].includes(role)) {
            return res.status(400).json({ message: "Role must be 'middleman', 'company' or 'agrios_operator'" });
        }

        const existingUser = await users2Model.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: "User already exists, please login" });
        }

        const user = await users2Model.create({ name, email, password, role: role || "middleman" });

        return res.status(201).json({
            message: "Registered successfully, please login",
            user: user.toSafeJSON(),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await users2Model.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = signToken(user);

        return res.status(200).json({
            message: "Login successful",
            token,
            user: user.toSafeJSON(),
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const getMe = async (req, res) => {
    return res.status(200).json({ user: req.user.toSafeJSON() });
};

module.exports = { registerUser, loginUser, getMe };
