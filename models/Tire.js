const mongoose = require("mongoose");

const tireSchema = new mongoose.Schema({
  dimension: String,
  materialCode: String,
  lisi: String,
  pattern: String,
  billingPrice: Number,
  stock: Number
});

module.exports = mongoose.model("Tire", tireSchema);
