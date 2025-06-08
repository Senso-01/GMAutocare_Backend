const express = require("express");
const router = express.Router();
const Tire = require("../models/Tire");

// Get all tires
router.get("/", async (req, res) => {
  try {
    const tires = await Tire.find();
    res.json(tires);
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

module.exports = router;
