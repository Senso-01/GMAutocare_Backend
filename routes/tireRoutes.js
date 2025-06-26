const express = require("express");
const router = express.Router();
const Tire = require("../models/Tire");

// Get tires with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const tires = await Tire.find().skip(skip).limit(limit);
    const total = await Tire.countDocuments();

    res.json({
      tires,
      total,
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
