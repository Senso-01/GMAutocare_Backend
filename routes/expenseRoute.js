const express = require('express');
const router = express.Router();
const Expense = require('../models/expenseSchema');

// Get all expenses with optional date filtering
router.get('/expenses', async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;
    let query = {};

    // Date filtering
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate + 'T23:59:59.999Z');
      }
    }

    // Search by key
    if (search) {
      query.key = { $regex: search, $options: 'i' };
    }

    const expenses = await Expense.find(query)
      .sort({ date: -1, createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: expenses,
      count: expenses.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching expenses',
      error: error.message
    });
  }
});

// Add new expense
router.post('/expenses', async (req, res) => {
  try {
    const { key, value, date } = req.body;

    // Validation
    if (!key || !value) {
      return res.status(400).json({
        success: false,
        message: 'Key and value are required'
      });
    }

    if (isNaN(value) || value < 0) {
      return res.status(400).json({
        success: false,
        message: 'Value must be a positive number'
      });
    }

    const expenseData = {
      key: key.trim(),
      value: parseFloat(value)
    };

    // If date is provided, use it, otherwise use current date
    if (date) {
      expenseData.date = new Date(date);
    }

    const expense = new Expense(expenseData);
    await expense.save();

    res.status(201).json({
      success: true,
      message: 'Expense added successfully',
      data: expense
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error adding expense',
      error: error.message
    });
  }
});

// Update expense
router.put('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value, date } = req.body;

    const updateData = {};
    if (key) updateData.key = key.trim();
    if (value !== undefined) {
      if (isNaN(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: 'Value must be a positive number'
        });
      }
      updateData.value = parseFloat(value);
    }
    if (date) updateData.date = new Date(date);

    const expense = await Expense.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: expense
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating expense',
      error: error.message
    });
  }
});

// Delete expense
router.delete('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting expense',
      error: error.message
    });
  }
});

// Get expense statistics
router.get('/expenses/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchCondition = {};

    if (startDate || endDate) {
      matchCondition.date = {};
      if (startDate) matchCondition.date.$gte = new Date(startDate);
      if (endDate) matchCondition.date.$lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const stats = await Expense.aggregate([
      { $match: matchCondition },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$value' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$value' },
          maxAmount: { $max: '$value' },
          minAmount: { $min: '$value' }
        }
      }
    ]);

    res.json({
      success: true,
      data: stats[0] || {
        totalAmount: 0,
        count: 0,
        avgAmount: 0,
        maxAmount: 0,
        minAmount: 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: error.message
    });
  }
});

module.exports = router;