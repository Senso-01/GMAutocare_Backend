// models/TyrePurchase.js
const mongoose = require('mongoose');

const tyrePurchaseSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    billNo: {
        type: String,
        required: true
        // Removed unique: true to allow duplicate bill numbers
    },
    tyreSize: {
        type: String,
        required: true
    },
    pattern: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
   
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Index for faster querying (but not unique)
tyrePurchaseSchema.index({ billNo: 1 });
tyrePurchaseSchema.index({ date: 1 });
tyrePurchaseSchema.index({ tyreSize: 1, pattern: 1 });

module.exports = mongoose.model('TyrePurchase', tyrePurchaseSchema);