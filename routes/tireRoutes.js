const express = require("express");
const router = express.Router();
const Tire = require("../models/Tire");

// In tireRoutes.js, modify the GET / endpoint
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const tires = await Tire.find().skip(skip).limit(limit);
    const total = await Tire.countDocuments();
    
    // Add this to calculate total stock across all tires
    const totalStockResult = await Tire.aggregate([
      {
        $group: {
          _id: null,
          totalStock: { $sum: "$stock" }
        }
      }
    ]);
    const totalStock = totalStockResult[0]?.totalStock || 0;

    res.json({
      tires,
      total,
      totalStock, // Add this to the response
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new tire
router.post("/add", async (req, res) => {
  try {
    const newTire = new Tire(req.body);
    await newTire.save();
    res.status(201).json(newTire);  // return saved tire with _id
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In tireRoutes.js, add this new route
router.get("/search", async (req, res) => {
  try {
    const searchTerm = req.query.q;
    if (!searchTerm) {
      return res.status(400).json({ error: "Search term is required" });
    }

    // Create a case-insensitive regex for search
    const searchRegex = new RegExp(searchTerm, 'i');
    
    // Search across multiple fields
    const tires = await Tire.find({
      $or: [
        { dimension: searchRegex },
        { materialCode: searchRegex },
        { lisi: searchRegex },
        { pattern: searchRegex }
      ]
    });

    // Calculate total stock for the search results
    const totalStock = tires.reduce((sum, tire) => sum + tire.stock, 0);

    res.json({
      tires,
      total: tires.length,
      totalStock
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a tire by ID
router.delete('/:id', async (req, res) => {
  try {
    const tire = await Tire.findByIdAndDelete(req.params.id);
    if (!tire) {
      return res.status(404).json({ message: 'Tire not found' });
    }
    res.json({ message: 'Tire deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a tire by ID
router.put('/:id', async (req, res) => {
  try {
    const updatedTire = await Tire.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedTire) {
      return res.status(404).json({ message: 'Tire not found' });
    }
    res.json(updatedTire);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Update tire route (remove stock validation)
router.post('/update-stock', async (req, res) => {
  try {
    const { tireId, quantity } = req.body;
    
    const tire = await Tire.findById(tireId);
    if (!tire) {
      return res.status(404).json({ message: 'Tire not found' });
    }

    // Only reduce stock if it's positive
    if (tire.stock > 0) {
      tire.stock = Math.max(0, tire.stock - quantity);
    }
    await tire.save();
    
    res.json(tire);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
