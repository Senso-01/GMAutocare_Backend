const mongoose = require("mongoose");

const tireSchema = new mongoose.Schema({   
  dimension: String,
  materialCode: String,
  lisi: String,
  pattern: String,
  billingPrice: Number,
   ourPrice: {
    type: Number,
    default: 0
  },
  customerPrice: {
    type: Number,
    default: 0
  },
    stock: {
    type: Number,
    required: true,
    default: 0  // Remove min: 0 constraint
  }
});

module.exports = mongoose.model("Tire", tireSchema);
