const express = require("express");
const path = require("path");
const connectDB = require("./config/db.js");
const cors = require("cors");
const multer = require("multer");
const authRoutes = require("./routes/authRoutes.js");
const requestRoutes = require("./routes/requestRoutes.js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

connectDB();

app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/requests", requestRoutes);

// Serve the built frontend so the whole app runs from one server (localhost:5000)
const frontendDist = path.join(__dirname, "frontend", "dist");
const landingDir = path.join(__dirname, "public1", "New folder (2)");

// Landing page at the root
app.use(express.static(landingDir));

// React app (login + portals) under /platform
app.use("/platform", express.static(frontendDist));

// Static pages served at clean URLs
app.get(["/blog", "/contact"], (req, res) => {
    res.sendFile(path.join(landingDir, `${req.path.slice(1)}.html`));
});

app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
        return next();
    }
    if (req.path.startsWith("/platform")) {
        return res.sendFile(path.join(frontendDist, "index.html"));
    }
    return next();
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message === "Only image files are allowed") {
        return res.status(400).json({ message: err.message });
    }
    return res.status(500).json({ message: "Server error", error: err.message });
});

module.exports = app;
