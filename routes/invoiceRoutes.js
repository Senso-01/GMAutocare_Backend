// routes/invoiceRoutes.js
const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');

// Get next invoice number
router.get('/next-number', async (req, res) => {
  try {
    const lastInvoice = await Invoice.findOne().sort({ invoiceNumber: -1 });

    let nextNumber = 1;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      const numberPart = lastInvoice.invoiceNumber.replace('Gmautocare', '');
      nextNumber = parseInt(numberPart) + 1;
    }

    const paddedNumber = nextNumber.toString().padStart(3, '0');
    const invoiceNumber = `Gmautocare${paddedNumber}`;

    res.json({ invoiceNumber, nextNumber });
  } catch (error) {
    console.error('Error getting next invoice number:', error);
    res.status(500).json({ error: 'Failed to get next invoice number' });
  }
});

// Create new invoice (with separate service amounts)
router.post('/create', async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerName,
      customerPhone,
      carModel,           // Car Model
      customerGST,        // 🔥 NEW: Customer GST
      paymentMethod,      // Payment Method
      invoiceDate,
      items,
      services, // Service items
      
      // Separate subtotals
      itemsSubtotal,
      servicesSubtotal,
      totalAmount,
      
      // Tax amounts (only for items, services are tax-free)
      cgstAmount,
      sgstAmount,
      grandTotal
    } = req.body;

    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }

    const newInvoice = new Invoice({
      invoiceNumber,
      customerName,
      customerPhone,
      carModel,                     // Car Model
      customerGST,                  // 🔥 NEW: Customer GST
      paymentMethod,                // Payment Method
      invoiceDate: new Date(invoiceDate),
      items,
      services, // Add services to the database
      
      // Separate subtotals
      itemsSubtotal: itemsSubtotal || 0,
      servicesSubtotal: servicesSubtotal || 0,
      totalAmount,
      
      // Tax amounts (only for items, services are tax-free)
      cgstAmount: cgstAmount || 0,
      sgstAmount: sgstAmount || 0,
      grandTotal,
      createdAt: new Date()
    });

    await newInvoice.save();
    res.status(201).json({ 
      message: 'Invoice created successfully', 
      invoice: newInvoice 
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    if (error.name === 'ValidationError') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to create invoice' });
    }
  }
});

// Get all invoices (with pagination)
router.get('/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const invoices = await Invoice.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Invoice.countDocuments();

    res.json({
      invoices,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// Get invoice by number
router.get('/:invoiceNumber', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ 
      invoiceNumber: req.params.invoiceNumber 
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// Search invoices
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const invoices = await Invoice.find({
      $or: [
        { invoiceNumber: { $regex: query, $options: 'i' } },
        { customerName: { $regex: query, $options: 'i' } },
        { customerPhone: { $regex: query, $options: 'i' } },
        { customerGST: { $regex: query, $options: 'i' } }  // 🔥 NEW: Search by GST
      ]
    }).sort({ createdAt: -1 });

    res.json(invoices);
  } catch (error) {
    console.error('Error searching invoices:', error);
    res.status(500).json({ error: 'Failed to search invoices' });
  }
});

// New route to get invoice breakdown by type
router.get('/breakdown/:invoiceNumber', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ 
      invoiceNumber: req.params.invoiceNumber 
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const breakdown = {
      items: {
        subtotal: invoice.itemsSubtotal,
        cgst: invoice.cgstAmount,
        sgst: invoice.sgstAmount,
        total: invoice.itemsSubtotal + invoice.cgstAmount + invoice.sgstAmount
      },
      services: {
        subtotal: invoice.servicesSubtotal,
        cgst: 0, // Services are tax-free
        sgst: 0, // Services are tax-free
        total: invoice.servicesSubtotal // No tax on services
      },
      overall: {
        subtotal: invoice.totalAmount,
        cgst: invoice.cgstAmount,
        sgst: invoice.sgstAmount,
        grandTotal: invoice.grandTotal
      }
    };

    res.json(breakdown);
  } catch (error) {
    console.error('Error getting invoice breakdown:', error);
    res.status(500).json({ error: 'Failed to get invoice breakdown' });
  }
});

module.exports = router;