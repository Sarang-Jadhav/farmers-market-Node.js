const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 0.5 }
});

const cartSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items: [cartItemSchema]
}, { timestamps: true });

// Virtual: total price (needs populated productId)
cartSchema.virtual('totalPrice').get(function () {
  return this.items.reduce((sum, item) => {
    if (item.productId && item.productId.pricePerKg) {
      return sum + item.productId.pricePerKg * item.quantity;
    }
    return sum;
  }, 0);
});

module.exports = mongoose.model('Cart', cartSchema);