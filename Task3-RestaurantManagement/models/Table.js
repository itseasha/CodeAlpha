const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
  tableNumber: { type: Number, required: true, unique: true },
  capacity: { type: Number, required: true, min: 1, max: 20 },
  location: { type: String, enum: ['indoor', 'outdoor', 'patio'], default: 'indoor' },
  status: { type: String, enum: ['available', 'occupied', 'reserved', 'cleaning'], default: 'available' },
  currentOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }
});

module.exports = mongoose.model('Table', tableSchema);