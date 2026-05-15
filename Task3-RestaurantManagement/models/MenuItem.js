const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  category: { 
    type: String, 
    required: true, 
    enum: ['appetizer', 'main-course', 'dessert', 'beverage', 'soup', 'salad'] 
  },
  isAvailable: { type: Boolean, default: true },
  ingredients: [String],
  preparationTime: { type: Number, default: 15 },
  spiceLevel: { type: String, enum: ['mild', 'medium', 'hot', 'extra-hot'], default: 'medium' }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', menuItemSchema);