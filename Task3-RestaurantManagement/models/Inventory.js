const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  itemName: { type: String, required: true, unique: true },
  category: { type: String, required: true, enum: ['raw', 'packaged', 'beverage'] },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, required: true, enum: ['kg', 'g', 'l', 'ml', 'pieces'] },
  minStock: { type: Number, required: true, min: 0 },
  pricePerUnit: Number,
  supplier: String,
  lastRestocked: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);