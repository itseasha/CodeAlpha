const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: String,
  quantity: { type: Number, required: true, min: 1 },
  price: Number,
  subtotal: Number,
  specialInstructions: String
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
  customerName: { type: String, required: true },
  customerPhone: String,
  items: [orderItemSchema],
  subtotal: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  serviceCharge: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  status: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'] 
  },
  paymentMethod: { type: String, enum: ['cash', 'card', 'online'], default: 'cash' },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'refunded'], default: 'pending' },
  specialRequests: String
}, { timestamps: true });

orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD-${Date.now()}-${count + 1}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);