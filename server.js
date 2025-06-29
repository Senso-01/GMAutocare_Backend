const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

// === Middleware ===
app.use(cors());
app.use(express.json());

// === MongoDB Connection ===
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1); // Exit on DB failure
  });

// === Route Imports ===
const tireRoutes = require("./routes/tireRoutes");
const adminRoutes = require("./routes/adminRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");

// === Route Middleware ===
app.use("/api/tires", tireRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/invoices", invoiceRoutes);

// === Root Route ===
app.get("/", (req, res) => {
  res.send("🚀 GM AutoCare API is running...");
});

// === 404 Handler ===
app.use((req, res) => {
  res.status(404).json({ message: " Route not found" });
});

// === Server Startup ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
