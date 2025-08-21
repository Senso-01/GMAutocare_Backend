// routes/tyrePurchases.js
const express = require('express');
const router = express.Router();
const TyrePurchase = require('../models/TyrePurchase');
const Tire = require('../models/Tire');
const Invoice = require('../models/Invoice');

// Create a new tyre purchase
router.post('/', async (req, res) => {
    try {
        const { tyreSize, pattern, quantity, brand } = req.body;

        // Create the purchase record
        const newPurchase = new TyrePurchase({
            ...req.body,
            brand: brand || '' // Ensure brand is included
        });
        const savedPurchase = await newPurchase.save();

        // Update tire stock with brand
        await updateTireStock(tyreSize, pattern, quantity, brand);

        res.status(201).json(savedPurchase);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Helper function to update tire stock
async function updateTireStock(tyreSize, pattern, quantity, brand = '') {
    const existingTire = await Tire.findOne({
        dimension: tyreSize,
        pattern: pattern
    });

    if (existingTire) {
        existingTire.stock += parseInt(quantity);
        // Update brand if provided and not empty
        if (brand && brand.trim() !== '') {
            existingTire.materialCode = brand;
        }
        await existingTire.save();
    } else {
        const newTire = new Tire({
            dimension: tyreSize,
            pattern: pattern,
            materialCode: brand || '', // Set brand if provided
            lisi: '',
            stock: quantity,
            billingPrice: 0,    // Default prices
            ourPrice: 0,
            customerPrice: 0
        });
        await newTire.save();
    }
}

// Get recent purchases with pagination and filters
router.get('/recent', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Build the query based on filters
        let query = {};

        // Search filter
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { billNo: searchRegex },
                { tyreSize: searchRegex },
                { pattern: searchRegex }
            ];
        }

        // Date range filter
        if (req.query.startDate || req.query.endDate) {
            query.date = {};
            if (req.query.startDate) {
                query.date.$gte = new Date(req.query.startDate);
            }
            if (req.query.endDate) {
                query.date.$lte = new Date(req.query.endDate);
            }
        }

        const [purchases, total] = await Promise.all([
            TyrePurchase.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            TyrePurchase.countDocuments(query)
        ]);

        res.json({
            data: purchases,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// In tyrePurchasesRoute.js - Update the stock-levels route to calculate totals across all items
router.get('/stock-levels', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const month = req.query.month;
        const search = req.query.search || '';

        // Build date filter for monthly sales
        let dateFilter = {};
        if (month) {
            const year = new Date().getFullYear();
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 1);
            
            dateFilter = {
                invoiceDate: {
                    $gte: startDate,
                    $lt: endDate
                }
            };
        }

        // Get all sold items from invoices
        const [monthlySales, allTimeSales] = await Promise.all([
            // Monthly sales
            Invoice.aggregate([
                { $match: dateFilter },
                { $unwind: '$items' },
                { 
                    $group: { 
                        _id: {
                            dimension: '$items.dimension',
                            pattern: '$items.pattern',
                            brand: '$items.brand'
                        },
                        quantity: { $sum: '$items.quantity' }
                    }
                },
                { $match: { quantity: { $gt: 0 } } }
            ]),
            // All-time sales
            Invoice.aggregate([
                { $unwind: '$items' },
                { 
                    $group: { 
                        _id: {
                            dimension: '$items.dimension',
                            pattern: '$items.pattern',
                            brand: '$items.brand'
                        },
                        quantity: { $sum: '$items.quantity' }
                    }
                },
                { $match: { quantity: { $gt: 0 } } }
            ])
        ]);

        // Get tires that are either sold OR in stock
        let tireQuery = {
            $or: [
                { stock: { $gt: 0 } }, // Tires with stock
                { // Tires that have been sold (we'll match these by dimension/pattern)
                    $or: allTimeSales.map(sale => ({
                        dimension: sale._id.dimension,
                        pattern: sale._id.pattern
                    }))
                }
            ]
        };

        // Add search filter if provided
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            tireQuery = {
                $and: [
                    tireQuery,
                    {
                        $or: [
                            { dimension: searchRegex },
                            { pattern: searchRegex },
                            { materialCode: searchRegex }
                        ]
                    }
                ]
            };
        }

        const [relevantTires, totalRelevantTires, allRelevantTires] = await Promise.all([
            Tire.find(tireQuery).skip(skip).limit(limit),
            Tire.countDocuments(tireQuery),
            Tire.find(tireQuery) // Get ALL relevant tires for totals calculation
        ]);

        // Combine data for current page
        const combinedData = await Promise.all(
            relevantTires.map(async (tire) => {
                const monthlySale = monthlySales.find(item => 
                    item._id.dimension === tire.dimension && 
                    item._id.pattern === tire.pattern
                );
                
                const allTimeSale = allTimeSales.find(item => 
                    item._id.dimension === tire.dimension && 
                    item._id.pattern === tire.pattern
                );

                return {
                    dimension: tire.dimension,
                    pattern: tire.pattern,
                    brand: tire.materialCode || 'N/A',
                    stock: tire.stock,
                    monthlySold: monthlySale ? monthlySale.quantity : 0,
                    allTimeSold: allTimeSale ? allTimeSale.quantity : 0,
                    status: allTimeSale ? 'sold' : (tire.stock > 0 ? 'in_stock' : 'out_of_stock')
                };
            })
        );

        // Calculate totals across ALL relevant tires (not just current page)
        const totalMonthlySold = monthlySales.reduce((sum, item) => sum + item.quantity, 0);
        const totalAllTimeSold = allTimeSales.reduce((sum, item) => sum + item.quantity, 0);
        
        // Calculate stock on hand across ALL relevant tires
        const totalStockOnHand = allRelevantTires.reduce((sum, tire) => sum + tire.stock, 0);

        res.json({
            data: combinedData,
            pagination: {
                page,
                limit,
                total: totalRelevantTires,
                pages: Math.ceil(totalRelevantTires / limit),
                hasNext: page * limit < totalRelevantTires,
                hasPrev: page > 1
            },
            totals: {
                monthlySold: totalMonthlySold,
                allTimeSold: totalAllTimeSold,
                stockOnHand: totalStockOnHand,
                totalItems: totalRelevantTires
            }
        });
    } catch (error) {
        console.error('Error in stock-levels:', error);
        res.status(500).json({ 
            error: 'Failed to fetch stock levels',
            details: error.message 
        });
    }
});

async function getSoldQuantity(dimension, pattern, month) {
    const match = {
        'items.dimension': dimension,
        'items.pattern': pattern
    };

    if (month) {
        const year = new Date().getFullYear();
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        match.date = {
            $gte: startDate,
            $lt: endDate
        };
    }

    const result = await Invoice.aggregate([
        { $unwind: '$items' },
        { $match: match },
        {
            $group: {
                _id: null,
                totalSold: { $sum: '$items.quantity' }
            }
        }
    ]);
    return result.length > 0 ? result[0].totalSold : 0;
}


// Get purchase by ID
router.get('/:id', async (req, res) => {
    try {
        const purchase = await TyrePurchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }
        res.json(purchase);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update a purchase
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tyreSize, pattern, quantity, originalQuantity, brand } = req.body;

        // Find the existing purchase
        const existingPurchase = await TyrePurchase.findById(id);
        if (!existingPurchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        // Calculate the difference in quantity
        const quantityDifference = quantity - originalQuantity;

        // Update the purchase
        const updatedPurchase = await TyrePurchase.findByIdAndUpdate(
            id,
            { ...req.body, brand }, // Ensure brand is included
            { new: true }
        );

        // Update tire stock with the difference and brand
        if (quantityDifference !== 0 || brand) {
            await updateTireStock(tyreSize, pattern, quantityDifference, brand);
        }

        res.json(updatedPurchase);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
// Delete a purchase
router.delete('/:id', async (req, res) => {
    try {
        const purchase = await TyrePurchase.findById(req.params.id);
        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found' });
        }

        // Remove the purchase and update stock
        await TyrePurchase.findByIdAndDelete(req.params.id);
        await updateTireStock(
            purchase.tyreSize, 
            purchase.pattern, 
            -purchase.quantity
        );

        res.json({ message: 'Purchase deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
