const express = require("express");
const { registerUser, loginUser, getMe } = require("../controllers/authController.js");
const { protect, authorize } = require("../middlewares/authMiddleware.js");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getMe);
router.get("/company-only", protect, authorize("company"), (req, res) => {
    res.status(200).json({ message: "Welcome buyer", user: req.user.toSafeJSON() });
});

module.exports = router;
