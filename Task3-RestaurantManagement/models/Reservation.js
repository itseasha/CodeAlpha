const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  reservationNumber: { type: String, unique: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: String,
  guests: { type: Number, required: true, min: 1 },
  table: { type: mongoose.Schema.Types.ObjectId, ref: 'Table' },
  date: { type: Date, required: true },
  time: String,
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' },
  specialRequests: String
}, { timestamps: true });

reservationSchema.pre('save', async function(next) {
  if (!this.reservationNumber) {
    const count = await mongoose.model('Reservation').countDocuments();
    this.reservationNumber = `RES-${Date.now()}-${count + 1}`;
  }
  next();
});

module.exports = mongoose.model('Reservation', reservationSchema);