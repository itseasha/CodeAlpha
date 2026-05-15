const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');

// Get all menu items
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isAvailable: true };
    if (category) filter.category = category;
    
    const menu = await MenuItem.find(filter).sort({ category: 1, name: 1 });
    res.json({ success: true, count: menu.length, data: menu });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create menu item
router.post('/', async (req, res) => {
  try {
    const item = await MenuItem.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;