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
      const numberPart = lastInvoice.invoiceNumber.replace('SVK-', '');
      nextNumber = parseInt(numberPart) + 1;
    }

    const paddedNumber = nextNumber.toString().padStart(3, '0');
    const invoiceNumber = `SVK-${paddedNumber}`;

    res.json({ invoiceNumber, nextNumber });
  } catch (error) {
    console.error('Error getting next invoice number:', error);
    res.status(500).json({ error: 'Failed to get next invoice number' });
  }
});

// 🔥 HELPER FUNCTION: Process payment details based on payment method
function processPaymentDetails(paymentMethod, grandTotal, paymentDetails = {}) {
  const result = {
    cashAmount: 0,
    onlineAmount: 0,
    onlineReference: paymentDetails.onlineReference || null
  };

  switch (paymentMethod) {
    case 'cash':
      result.cashAmount = grandTotal;
      break;
    case 'online':
      result.onlineAmount = grandTotal;
      break;
    case 'both':
      result.cashAmount = paymentDetails.cashAmount || 0;
      result.onlineAmount = paymentDetails.onlineAmount || 0;
      
      // Validate that amounts add up to grand total
      const totalPayment = result.cashAmount + result.onlineAmount;
      if (Math.abs(totalPayment - grandTotal) > 0.01) {
        throw new Error(`Payment amounts (Cash: ${result.cashAmount}, Online: ${result.onlineAmount}) must equal grand total: ${grandTotal}`);
      }
      break;
    default:
      throw new Error('Invalid payment method');
  }

  return result;
}

// Create new invoice
router.post('/create', async (req, res) => {
  try {
    const {
      invoiceNumber,
      customerName,
      customerPhone,
      carModel,
      carNumber,
      usageReading,
      customerGST,
      paymentMethod,
      paymentDetails, // 🔥 NEW: Payment details for split payments
      invoiceDate,
      items,
      services,
      
      // Separate subtotals
      itemsSubtotal,
      servicesSubtotal,
      totalAmount,
      
      // Tax amounts for items
      cgstAmount,
      sgstAmount,
      
      grandTotal
    } = req.body;

    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }

    // 🔥 NEW: Process payment details based on payment method
    let processedPaymentDetails;
    try {
      processedPaymentDetails = processPaymentDetails(paymentMethod, grandTotal, paymentDetails);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const newInvoice = new Invoice({
      invoiceNumber,
      customerName,
      customerPhone,
      carModel,
      carNumber,
      usageReading,
      customerGST,
      paymentMethod,
      paymentDetails: processedPaymentDetails, // 🔥 NEW: Include processed payment details
      invoiceDate: new Date(invoiceDate),
      items,
      services,
      
      // Separate subtotals
      itemsSubtotal: itemsSubtotal || 0,
      servicesSubtotal: servicesSubtotal || 0,
      totalAmount,
      
      // Tax amounts for items
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

router.get('/list', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = req.query.limit === 'all' ? null : parseInt(req.query.limit) || 10;

    let invoicesQuery = Invoice.find().sort({ createdAt: -1 });

    if (limit) {
      const skip = (page - 1) * limit;
      invoicesQuery = invoicesQuery.skip(skip).limit(limit);
    }

    const invoices = await invoicesQuery;
    const total = await Invoice.countDocuments();

    res.json({
      invoices,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      currentPage: limit ? page : 1,
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

// Search invoices (includes car number, usage reading, and online reference)
router.get('/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    const invoices = await Invoice.find({
      $or: [
        { invoiceNumber: { $regex: query, $options: 'i' } },
        { customerName: { $regex: query, $options: 'i' } },
        { customerPhone: { $regex: query, $options: 'i' } },
        { customerGST: { $regex: query, $options: 'i' } },
        { carNumber: { $regex: query, $options: 'i' } },
        { carModel: { $regex: query, $options: 'i' } },
        { 'paymentDetails.onlineReference': { $regex: query, $options: 'i' } }, // 🔥 NEW: Search by online reference
        { usageReading: isNaN(query) ? null : Number(query) }
      ]
    }).sort({ createdAt: -1 });

    res.json(invoices);
  } catch (error) {
    console.error('Error searching invoices:', error);
    res.status(500).json({ error: 'Failed to search invoices' });
  }
});

// 🔥 NEW: Get payment summary by payment method
router.get('/reports/payment-summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        invoiceDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    }

    const pipeline = [
      { $match: dateFilter },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: { $sum: '$grandTotal' },
          totalCash: { $sum: '$paymentDetails.cashAmount' },
          totalOnline: { $sum: '$paymentDetails.onlineAmount' },
          count: { $sum: 1 }
        }
      }
    ];

    const paymentSummary = await Invoice.aggregate(pipeline);
    
    // Calculate overall totals
    const overallTotals = paymentSummary.reduce((acc, curr) => {
      acc.totalAmount += curr.totalAmount;
      acc.totalCash += curr.totalCash;
      acc.totalOnline += curr.totalOnline;
      acc.count += curr.count;
      return acc;
    }, { totalAmount: 0, totalCash: 0, totalOnline: 0, count: 0 });

    res.json({
      paymentSummary,
      overallTotals,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({ error: 'Failed to fetch payment summary' });
  }
});

// Get usage readings history for a specific car
router.get('/usage/:carNumber', async (req, res) => {
  try {
    const carNumber = req.params.carNumber;
    
    const invoices = await Invoice.find({ 
      carNumber: carNumber,
      usageReading: { $ne: null }
    })
    .select('invoiceNumber invoiceDate usageReading customerName carModel')
    .sort({ invoiceDate: -1 });

    if (!invoices.length) {
      return res.status(404).json({ error: 'No usage readings found for this car number' });
    }

    res.json({
      carNumber,
      totalReadings: invoices.length,
      readings: invoices
    });
  } catch (error) {
    console.error('Error fetching usage readings:', error);
    res.status(500).json({ error: 'Failed to fetch usage readings' });
  }
});

// Get latest usage reading for a car
router.get('/usage/:carNumber/latest', async (req, res) => {
  try {
    const carNumber = req.params.carNumber;
    
    const latestInvoice = await Invoice.findOne({ 
      carNumber: carNumber,
      usageReading: { $ne: null }
    })
    .select('invoiceNumber invoiceDate usageReading customerName carModel')
    .sort({ invoiceDate: -1 });

    if (!latestInvoice) {
      return res.status(404).json({ error: 'No usage readings found for this car number' });
    }

    res.json({
      carNumber,
      invoiceNumber: latestInvoice.invoiceNumber,
      invoiceDate: latestInvoice.invoiceDate,
      customerName: latestInvoice.customerName,
      carModel: latestInvoice.carModel,
      latestReading: latestInvoice.usageReading
    });
  } catch (error) {
    console.error('Error fetching latest usage reading:', error);
    res.status(500).json({ error: 'Failed to fetch latest usage reading' });
  }
});

// Get all cars with their latest usage readings
router.get('/cars/usage-summary', async (req, res) => {
  try {
    const pipeline = [
      {
        $match: {
          carNumber: { $ne: null, $ne: '' },
          usageReading: { $ne: null }
        }
      },
      {
        $sort: { invoiceDate: -1 }
      },
      {
        $group: {
          _id: '$carNumber',
          latestInvoice: { $first: '$$ROOT' }
        }
      },
      {
        $project: {
          carNumber: '$_id',
          customerName: '$latestInvoice.customerName',
          carModel: '$latestInvoice.carModel',
          invoiceNumber: '$latestInvoice.invoiceNumber',
          invoiceDate: '$latestInvoice.invoiceDate',
          latestReading: '$latestInvoice.usageReading'
        }
      },
      {
        $sort: { invoiceDate: -1 }
      }
    ];

    const carsWithReadings = await Invoice.aggregate(pipeline);

    res.json({
      totalCars: carsWithReadings.length,
      cars: carsWithReadings
    });
  } catch (error) {
    console.error('Error fetching cars usage summary:', error);
    res.status(500).json({ error: 'Failed to fetch cars usage summary' });
  }
});

// Update invoice by invoiceNumber
router.put('/update/:invoiceNumber', async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    // 🔥 NEW: Process payment details if payment method or amounts are being updated
    if (updateData.paymentMethod || updateData.paymentDetails) {
      const existingInvoice = await Invoice.findOne({ invoiceNumber: req.params.invoiceNumber });
      if (!existingInvoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      const grandTotal = updateData.grandTotal || existingInvoice.grandTotal;
      const paymentMethod = updateData.paymentMethod || existingInvoice.paymentMethod;
      
      try {
        updateData.paymentDetails = processPaymentDetails(paymentMethod, grandTotal, updateData.paymentDetails);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber: req.params.invoiceNumber },
      updateData,
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ message: 'Invoice updated successfully', invoice });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// 🔥 NEW: Update payment details for an existing invoice
router.patch('/:invoiceNumber/payment', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { paymentMethod, paymentDetails } = req.body;

    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (!existingInvoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Process payment details
    let processedPaymentDetails;
    try {
      processedPaymentDetails = processPaymentDetails(paymentMethod, existingInvoice.grandTotal, paymentDetails);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      { 
        paymentMethod,
        paymentDetails: processedPaymentDetails
      },
      { new: true, runValidators: true }
    );

    res.json({ 
      message: 'Payment details updated successfully', 
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        paymentMethod: invoice.paymentMethod,
        paymentDetails: invoice.paymentDetails,
        grandTotal: invoice.grandTotal,
        updatedAt: invoice.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating payment details:', error);
    res.status(500).json({ error: 'Failed to update payment details' });
  }
});

// Delete invoice by invoiceNumber
router.delete('/delete/:invoiceNumber', async (req, res) => {
  try {
    const result = await Invoice.findOneAndDelete({ invoiceNumber: req.params.invoiceNumber });

    if (!result) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

// Update usage reading for an existing invoice
router.patch('/:invoiceNumber/usage', async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const { usageReading } = req.body;

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      { usageReading },
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({ 
      message: 'Usage reading updated successfully', 
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        carNumber: invoice.carNumber,
        usageReading: invoice.usageReading,
        updatedAt: invoice.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating usage reading:', error);
    res.status(500).json({ error: 'Failed to update usage reading' });
  }
});

module.exports = router;
