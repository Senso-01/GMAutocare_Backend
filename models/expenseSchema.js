const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  date: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better search performance
expenseSchema.index({ date: -1 });
expenseSchema.index({ key: 1 });

module.exports = mongoose.model('Expense', expenseSchema);