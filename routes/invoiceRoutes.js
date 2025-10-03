// routes/invoiceRoutes.js
const express = require('express');
const router = express.Router();
const Invoice = require('../models/Invoice');
//const mongoose = require('mongoose');

// === ADD DEBUG MIDDLEWARE FOR THIS ROUTER ===
router.use((req, res, next) => {
  console.log(`📋 Invoice Route: ${req.method} ${req.path}`);
  next();
});

// === SPECIFIC ROUTES FIRST (before parameter routes) ===


// Get next invoice number
router.get('/next-number', async (req, res) => {
  console.log('📢 Next number route hit');
  try {
    // First, check if we have any invoices at all
    const invoiceCount = await Invoice.countDocuments();
    
    let nextSequence = 1;
    
    if (invoiceCount > 0) {
      // Find the invoice with the highest sequence number
      const lastInvoice = await Invoice.findOne()
        .sort({ invoiceNumberSequence: -1 }) // Sort by sequence descending
        .select('invoiceNumberSequence');
      
      console.log('🔍 Last invoice found:', lastInvoice);
      
      if (lastInvoice && lastInvoice.invoiceNumberSequence) {
        nextSequence = lastInvoice.invoiceNumberSequence + 1;
        console.log('📈 Next sequence will be:', nextSequence);
      }
    } else {
      console.log('📝 No invoices found, starting from 1');
    }

    const paddedNumber = nextSequence.toString().padStart(3, '0');
    const invoiceNumber = `SVK-${paddedNumber}`;

    console.log('🎯 Generated invoice:', invoiceNumber, 'Sequence:', nextSequence);

    res.json({ 
      invoiceNumber, 
      invoiceNumberSequence: nextSequence
    });
  } catch (error) {
    console.error('❌ Error getting next invoice number:', error);
    res.status(500).json({ error: 'Failed to get next invoice number' });
  }
});

// Get regular customers - MOVED TO TOP PRIORITY
router.get('/regular-customers', async (req, res) => {
  console.log('👥 Regular customers route hit');
  try {
    const minInvoices = parseInt(req.query.minInvoices) || 3;
    console.log(`📊 Fetching customers with min ${minInvoices} invoices`);
    
    // Get customers with minimum invoice count and their latest invoices
    const result = await Invoice.aggregate([
      {
        $group: {
          _id: '$customerName',
          count: { $sum: 1 },
          latestInvoice: { $last: '$$ROOT' }
        }
      },
      { 
        $match: { 
          count: { $gte: minInvoices },
          '_id': { $ne: null } // Exclude null customer names
        } 
      },
      { $sort: { count: -1 } }
    ]);

    console.log(`✅ Found ${result.length} regular customers`);

    // Get all invoices for these customers
    const customerNames = result.map(c => c._id);
    const invoices = await Invoice.find({
      customerName: { $in: customerNames }
    }).sort({ invoiceDate: -1 });

    console.log(`✅ Found ${invoices.length} invoices for regular customers`);

    res.json({
      success: true,
      count: invoices.length,
      invoices: invoices,
      customerStats: result.map(c => ({
        name: c._id,
        totalInvoices: c.count,
        latestDate: c.latestInvoice.invoiceDate
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching regular customers:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch regular customers',
      details: error.message 
    });
  }
});

// Get invoices list
router.get('/list', async (req, res) => {
  console.log('📋 List route hit');
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

// Get payment summary report
router.get('/reports/payment-summary', async (req, res) => {
  console.log('📊 Payment summary route hit');
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

// Get pending invoices list
router.get('/pending/list', async (req, res) => {
  console.log('⏳ Pending list route hit');
  try {
    const pendingInvoices = await Invoice.find({ 
      isPending: true,
      pendingAmount: { $gt: 0 }
    }).sort({ invoiceDate: -1 });

    res.json({
      count: pendingInvoices.length,
      totalPendingAmount: pendingInvoices.reduce((sum, inv) => sum + inv.pendingAmount, 0),
      invoices: pendingInvoices
    });
  } catch (error) {
    console.error('Error fetching pending invoices:', error);
    res.status(500).json({ error: 'Failed to fetch pending invoices' });
  }
});

// Get cars usage summary
router.get('/cars/usage-summary', async (req, res) => {
  console.log('🚗 Cars usage summary route hit');
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

// === SEARCH AND USAGE ROUTES (with parameters but specific patterns) ===

// Search invoices
router.get('/search/:query', async (req, res) => {
  console.log(`🔍 Search route hit with query: ${req.params.query}`);
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
        { 'paymentDetails.onlineReference': { $regex: query, $options: 'i' } },
        { usageReading: isNaN(query) ? null : Number(query) }
      ]
    }).sort({ createdAt: -1 });

    res.json(invoices);
  } catch (error) {
    console.error('Error searching invoices:', error);
    res.status(500).json({ error: 'Failed to search invoices' });
  }
});

// Get usage readings for a specific car
router.get('/usage/:carNumber', async (req, res) => {
  console.log(`🚗 Usage route hit for car: ${req.params.carNumber}`);
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
  console.log(`🚗 Latest usage route hit for car: ${req.params.carNumber}`);
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

// === PARAMETER ROUTES LAST (these catch-all patterns) ===

// Get invoice by number - MOVED TO END
router.get('/:invoiceNumber', async (req, res) => {
  console.log(`📄 Individual invoice route hit: ${req.params.invoiceNumber}`);
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

// === POST/PUT/PATCH/DELETE ROUTES ===

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
  console.log('➕ Create invoice route hit');
  try {
    const {
      invoiceNumber,
      invoiceNumberSequence,
      customerName,
      customerPhone,
      carModel,
      carNumber,
      usageReading,
      customerGST,
      paymentMethod,
      paymentDetails,
      invoiceDate,
      items,
      services,
      itemsSubtotal,
      servicesSubtotal,
      totalAmount,
      cgstAmount,
      sgstAmount,
      grandTotal
    } = req.body;

    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (existingInvoice) {
      return res.status(400).json({ error: 'Invoice number already exists' });
    }

    let processedPaymentDetails;
    try {
      processedPaymentDetails = processPaymentDetails(paymentMethod, grandTotal, paymentDetails);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const newInvoice = new Invoice({
      invoiceNumber,
       invoiceNumberSequence: invoiceNumberSequence || 1,
      customerName,
      customerPhone,
      carModel,
      carNumber,
      usageReading,
      customerGST,
      paymentMethod,
      paymentDetails: processedPaymentDetails,
      invoiceDate: new Date(invoiceDate),
      items,
      services,
      itemsSubtotal: itemsSubtotal || 0,
      servicesSubtotal: servicesSubtotal || 0,
      totalAmount,
      cgstAmount: cgstAmount || 0,
      sgstAmount: sgstAmount || 0,
      grandTotal,
      createdAt: new Date()
    });

    await newInvoice.save();
      console.log('✅ Invoice created with sequence:', invoiceNumberSequence);
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

// Update invoice by invoiceNumber
router.put('/update/:invoiceNumber', async (req, res) => {
  console.log(`✏️ Update invoice route hit: ${req.params.invoiceNumber}`);
  try {
    const updateData = { ...req.body };
    const { bulkUpdate } = updateData;
    
    if (bulkUpdate) {
      const { customerName, updatePhone, updateGST } = bulkUpdate;
      const bulkUpdates = {};
      
      if (updatePhone && updateData.customerPhone) {
        bulkUpdates.customerPhone = updateData.customerPhone;
      }
      if (updateGST && updateData.customerGST) {
        bulkUpdates.customerGST = updateData.customerGST;
      }
      
      if (Object.keys(bulkUpdates).length > 0) {
        await Invoice.updateMany(
          { customerName },
          { $set: bulkUpdates }
        );
      }
    }

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

    if (updateData.items || updateData.services) {
      updateData.itemsSubtotal = (updateData.items || []).reduce((sum, item) => sum + (item.totalAmount || 0), 0);
      updateData.servicesSubtotal = (updateData.services || []).reduce((sum, service) => sum + (service.totalAmount || 0), 0);
      updateData.totalAmount = updateData.itemsSubtotal + updateData.servicesSubtotal;

      updateData.itemsCgstAmount = updateData.itemsSubtotal * 0.14;
      updateData.itemsSgstAmount = updateData.itemsSubtotal * 0.14;
      updateData.servicesCgstAmount = updateData.servicesSubtotal * 0.09;
      updateData.servicesSgstAmount = updateData.servicesSubtotal * 0.09;

      updateData.cgstAmount = updateData.itemsCgstAmount + updateData.servicesCgstAmount;
      updateData.sgstAmount = updateData.itemsSgstAmount + updateData.servicesSgstAmount;
      updateData.grandTotal = updateData.totalAmount + updateData.cgstAmount + updateData.sgstAmount;
    }

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber: req.params.invoiceNumber },
      updateData,
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    let message = 'Invoice updated successfully';
    if (bulkUpdate) {
      message += ' (with bulk customer updates)';
      
      const customerInvoices = await Invoice.find({ customerName: invoice.customerName });
      return res.json({ 
        message,
        invoice,
        bulkUpdateDetails: {
          updatedInvoicesCount: customerInvoices.length,
          customerName: invoice.customerName
        }
      });
    }

    res.json({ message, invoice });
  } catch (error) {
    console.error('Error updating invoice:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update invoice',
      details: error.message 
    });
  }
});

// Update payment details for an existing invoice
router.patch('/:invoiceNumber/payment', async (req, res) => {
  console.log(`💰 Payment update route hit: ${req.params.invoiceNumber}`);
  try {
    const { invoiceNumber } = req.params;
    const { paymentMethod, paymentDetails } = req.body;

    const existingInvoice = await Invoice.findOne({ invoiceNumber });
    if (!existingInvoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

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

// Update usage reading for an existing invoice
router.patch('/:invoiceNumber/usage', async (req, res) => {
  console.log(`📊 Usage update route hit: ${req.params.invoiceNumber}`);
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

// Mark invoice as pending/paid
router.patch('/:invoiceNumber/pending', async (req, res) => {
  console.log(`⏳ Pending update route hit: ${req.params.invoiceNumber}`);
  try {
    const { invoiceNumber } = req.params;
    const { pendingAmount, isPending } = req.body;

    const invoice = await Invoice.findOneAndUpdate(
      { invoiceNumber },
      { 
        pendingAmount: pendingAmount || 0,
        isPending: isPending || false
      },
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({
      message: 'Pending status updated successfully',
      invoice
    });
  } catch (error) {
    console.error('Error updating pending status:', error);
    res.status(500).json({ error: 'Failed to update pending status' });
  }
});

// Delete invoice by invoiceNumber
router.delete('/delete/:invoiceNumber', async (req, res) => {
  console.log(`🗑️ Delete route hit: ${req.params.invoiceNumber}`);
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




module.exports = router;
