// routes/paymentRoute.js
const express = require('express');
const router = express.Router();
const Payment = require('../models/payments');

// Add a new payment
router.post('/', async (req, res) => {
    try {
        const { name, amount, type, date } = req.body;
        
        // Validate input
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }
        
        if (!amount || isNaN(amount)) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        if (!type || !['salary', 'advance', 'deposit'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid payment type' });
        }

        if (!date || isNaN(new Date(date).getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date' });
        }
        
        // Create new payment
        const payment = new Payment({
            name: name.trim(),
            amount,
            type,
            date: new Date(date)
        });
        
        await payment.save();
        
        res.json({ success: true, payment });
    } catch (error) {
        console.error('Error adding payment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all payments with optional filters
router.get('/', async (req, res) => {
    try {
        const { name, type, date } = req.query;
        const query = {};
        
        if (name) query.name = { $regex: name, $options: 'i' };
        if (type) query.type = type;
        if (date) {
            const selectedDate = new Date(date);
            const nextDate = new Date(selectedDate);
            nextDate.setDate(nextDate.getDate() + 1);
            
            query.date = {
                $gte: selectedDate,
                $lt: nextDate
            };
        }
        
        const payments = await Payment.find(query).sort({ date: -1 });
        res.json({ success: true, payments });
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;