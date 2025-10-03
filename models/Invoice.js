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
   invoiceNumberSequence: {
    type: Number, // Add numeric sequence for proper sorting
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
  carModel: {
    type: String,
    trim: true,
    default: null
  },
  carNumber: {
    type: String,
    trim: true,
    default: null
  },
  usageReading: {
    type: Number,
    default: null
  },
  customerGST: {
    type: String,
    trim: true,
    default: null,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Invalid GST format. GST should be 15 characters (e.g., 22AAAAA0000A1Z5)'
    }
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'online', 'both'],
    required: true
  },
  paymentDetails: {
    cashAmount: {
      type: Number,
      required: function() { return this.paymentMethod === 'cash' || this.paymentMethod === 'both'; },
      validate: {
        validator: function(v) {
          if (this.paymentMethod === 'cash') return v === this.grandTotal;
          if (this.paymentMethod === 'both') return v > 0 && v < this.grandTotal;
          return true;
        },
        message: props => `Invalid cash amount for the selected payment method`
      }
    },
    onlineAmount: {
      type: Number,
      required: function() { return this.paymentMethod === 'online' || this.paymentMethod === 'both'; },
      validate: {
        validator: function(v) {
          if (this.paymentMethod === 'online') return v === this.grandTotal;
          if (this.paymentMethod === 'both') return v > 0 && (v + this.paymentDetails.cashAmount) === this.grandTotal;
          return true;
        },
        message: props => `Invalid online amount for the selected payment method`
      }
    },
    onlineReference: {
      type: String,
      required: false,
      default: null
    }
  },
  invoiceDate: {
    type: Date,
    required: true
  },
  items: [invoiceItemSchema],
  services: [serviceItemSchema],
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
  pendingAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  isPending: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

invoiceSchema.pre('save', function(next) {
  if (this.paymentMethod === 'both') {
    const totalPayment = (this.paymentDetails.cashAmount || 0) + (this.paymentDetails.onlineAmount || 0);
    if (Math.abs(totalPayment - this.grandTotal) > 0.01) {
      return next(new Error(`Payment amounts (Cash: ${this.paymentDetails.cashAmount}, Online: ${this.paymentDetails.onlineAmount}) must equal grand total: ${this.grandTotal}`));
    }
  }
  next();
});

invoiceSchema.index({ customerName: 1 });
invoiceSchema.index({ customerPhone: 1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ carModel: 1 });
invoiceSchema.index({ carNumber: 1 });
invoiceSchema.index({ paymentMethod: 1 });
invoiceSchema.index({ customerGST: 1 });
invoiceSchema.index({ 'paymentDetails.onlineReference': 1 });
invoiceSchema.index({ isPending: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
