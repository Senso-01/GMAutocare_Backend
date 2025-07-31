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

// Updated stock-levels route in tyrePurchasesRoute.js
router.get('/stock-levels', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const month = req.query.month;
        const search = req.query.search || '';

        // First get all tires that have been sold (regardless of current stock)
        let soldItemsMatch = {};
        if (month) {
            const year = new Date().getFullYear();
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 1);
            
            soldItemsMatch = {
                invoiceDate: {
                    $gte: startDate,
                    $lt: endDate
                }
            };
        }

        const [soldItems, allTimeSoldItems] = await Promise.all([
            Invoice.aggregate([
                { $match: soldItemsMatch },
                { $unwind: '$items' },
                { 
                    $group: { 
                        _id: {
                            dimension: '$items.dimension',
                            pattern: '$items.pattern'
                        },
                        monthlySold: { $sum: '$items.quantity' }
                    }
                },
                { $match: { monthlySold: { $gt: 0 } } }
            ]),
            Invoice.aggregate([
                { $unwind: '$items' },
                { 
                    $group: { 
                        _id: {
                            dimension: '$items.dimension',
                            pattern: '$items.pattern'
                        },
                        allTimeSold: { $sum: '$items.quantity' }
                    }
                },
                { $match: { allTimeSold: { $gt: 0 } }}
            ])
        ]);

        // Build base query to get these tires' current stock
        let baseQuery = {};
        if (allTimeSoldItems.length > 0) {
            const dimensionPatternPairs = allTimeSoldItems.map(item => ({
                dimension: item._id.dimension,
                pattern: item._id.pattern
            }));
            baseQuery.$or = dimensionPatternPairs;
        }

        // Build final query with search filter
        let finalQuery = {};
        
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            const searchCondition = {
                $or: [
                    { dimension: searchRegex },
                    { pattern: searchRegex }
                ]
            };
            
            if (baseQuery.$or) {
                // Combine base query with search condition
                finalQuery = {
                    $and: [
                        baseQuery,
                        searchCondition
                    ]
                };
            } else {
                // Only search condition if no base query
                finalQuery = searchCondition;
            }
        } else {
            // Only base query if no search
            finalQuery = baseQuery;
        }

        // Execute queries only if we have conditions
        const [tires, total] = await Promise.all([
            Object.keys(finalQuery).length > 0 ? 
                Tire.find(finalQuery).skip(skip).limit(limit) : 
                [],
            Object.keys(finalQuery).length > 0 ? 
                Tire.countDocuments(finalQuery) : 
                0
        ]);

        // Combine with sold data
        const tiresWithSold = tires.map(tire => {
            const monthlySoldData = soldItems.find(item => 
                item._id.dimension === tire.dimension && 
                item._id.pattern === tire.pattern
            );
            
            const allTimeSoldData = allTimeSoldItems.find(item => 
                item._id.dimension === tire.dimension && 
                item._id.pattern === tire.pattern
            );

            return {
                ...tire.toObject(),
                monthlySold: monthlySoldData ? monthlySoldData.monthlySold : 0,
                allTimeSold: allTimeSoldData ? allTimeSoldData.allTimeSold : 0
            };
        });

        res.json({
            data: tiresWithSold,
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
