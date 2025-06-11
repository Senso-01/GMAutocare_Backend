// models/Invoice.js
const mongoose = require('mongoose');

// Existing item schema (for materials or tires)
const invoiceItemSchema = new mongoose.Schema({
  materialCode: {
    type: String,
    required: true
  },
  dimension: {
    type: String,
    required: true
  },
  pattern: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  totalAmount: {
    type: Number,
    required: true
  }
});

// Service items schema
const serviceItemSchema = new mongoose.Schema({
  serviceType: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  }
});

// Main invoice schema
const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  customerPhone: {
    type: String,
    trim: true,
    default: null
  },
  // Car Model field
  carModel: {
    type: String,
    trim: true,
    default: null
  },
  // Car Number field
  carNumber: {
    type: String,
    trim: true,
    default: null
  },
  // Usage Reading field
  usageReading: {
    type: Number,
    default: null
  },
  // 🔥 NEW: Customer GST field
  customerGST: {
    type: String,
    trim: true,
    default: null,
    validate: {
      validator: function(v) {
        // GST validation: should be 15 characters alphanumeric if provided
        if (!v) return true; // Allow empty/null values
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Invalid GST format. GST should be 15 characters (e.g., 22AAAAA0000A1Z5)'
    }
  },
  // Payment Method field
  paymentMethod: {
    type: String,
    enum: ['cash', 'online'],
    default: 'cash',
    required: true
  },
  invoiceDate: {
    type: Date,
    required: true
  },
  items: [invoiceItemSchema],       // Existing material/tire items
  services: [serviceItemSchema],    // Service items
  
  // Separate totals for items and services
  itemsSubtotal: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  servicesSubtotal: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Tax amounts only for items (services are tax-free)
  cgstAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  sgstAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  grandTotal: {
    type: Number,
    required: true,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
invoiceSchema.index({ customerName: 1 });
invoiceSchema.index({ customerPhone: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ carModel: 1 });
invoiceSchema.index({ carNumber: 1 });
invoiceSchema.index({ paymentMethod: 1 });
invoiceSchema.index({ customerGST: 1 }); // 🔥 NEW: Index for customer GST

module.exports = mongoose.model('Invoice', invoiceSchema);
