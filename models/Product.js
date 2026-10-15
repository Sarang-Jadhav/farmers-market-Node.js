const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  farmerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  pricePerKg: { type: Number, required: true, min: 0 },
  description: { type: String, trim: true },
  image: { type: String, default: 'default-product.jpg' },
  stock: { type: Number, default: 100, min: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);