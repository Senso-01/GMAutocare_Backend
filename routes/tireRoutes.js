const express = require("express");
const router = express.Router();
const Tire = require("../models/Tire");

// Get tires with optional pagination
router.get("/", async (req, res) => {
  try {
    if (req.query.pagination === 'false') {
      // Return all tires without pagination (for billing)
      const tires = await Tire.find();
      res.json(tires);
    } else {
      // Return paginated tires (for admin)
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const tires = await Tire.find().skip(skip).limit(limit);
      const total = await Tire.countDocuments();
      const totalStock = await Tire.aggregate([
        { $group: { _id: null, totalStock: { $sum: "$stock" } } }
      ]);

      res.json({
        tires,
        total,
        totalStock: totalStock[0]?.totalStock || 0,
        page,
        pages: Math.ceil(total / limit)
      });
    }
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

// Batch update stock for multiple tires
router.post('/batch-update-stock', async (req, res) => {
  try {
    const { updates } = req.body; // Array of { tireId, quantity }
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "Updates array is required" });
    }

    // Update all tires in parallel
    const updatePromises = updates.map(async (update) => {
      const { tireId, quantity } = update;
      
      const tire = await Tire.findById(tireId);
      if (!tire) {
        return { 
          success: false, 
          tireId, 
          error: 'Tire not found' 
        };
      }

      // Reduce stock (ensure it doesn't go negative)
      if (tire.stock > 0) {
        tire.stock = Math.max(0, tire.stock - quantity);
      }
      await tire.save();
      
      return { 
        success: true, 
        tireId, 
        newStock: tire.stock 
      };
    });

    const results = await Promise.all(updatePromises);
    
    // Check if any updates failed
    const failedUpdates = results.filter(r => !r.success);
    
    if (failedUpdates.length > 0) {
      return res.status(207).json({ // 207 Multi-Status
        message: `Partially updated: ${results.length - failedUpdates.length} succeeded, ${failedUpdates.length} failed`,
        results: results
      });
    }

    res.json({ 
      success: true, 
      message: `Successfully updated ${updates.length} tires`,
      results: results 
    });
    
  } catch (err) {
    console.error('Batch stock update error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
