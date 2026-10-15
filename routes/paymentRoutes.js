const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const { isAuthenticated } = require('../middleware/auth');
const { isCustomer } = require('../middleware/role');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.use(isAuthenticated, isCustomer);

// POST /payment/create-order
// Creates a Razorpay order, returns order ID to frontend
router.post('/create-order', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.user._id }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    // Filter out items whose referenced product was deleted
    const initialCount = cart.items.length;
    cart.items = cart.items.filter(item => item.productId && item.productId.pricePerKg != null);
    if (cart.items.length !== initialCount) {
      await cart.save();
    }

    if (cart.items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty or items are no longer available.' });
    }

    const totalPaise = cart.items.reduce((sum, item) => {
      const price = item.productId ? item.productId.pricePerKg : 0;
      return sum + Math.round(price * item.quantity * 100); // Razorpay works in paise
    }, 0);

    const razorpayOrder = await razorpay.orders.create({
      amount: totalPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`
    });

    res.json({ orderId: razorpayOrder.id, amount: totalPaise });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create payment order.' });
  }
});

// POST /payment/verify
// Verifies Razorpay signature and saves order to DB
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      req.flash('error', 'Payment verification failed.');
      return res.redirect('/user/checkout');
    }

    // Payment signature verified — fetch user's cart
    const cart = await Cart.findOne({ userId: req.session.user._id }).populate('items.productId');

    if (!cart) {
      console.error(`[PAYMENT_RECONCILIATION_REQUIRED] User ${req.session.user._id} payment verified (Payment ID: ${razorpay_payment_id}, Order ID: ${razorpay_order_id}), but cart was not found.`);
      req.flash('error', `Payment was received (${razorpay_payment_id}), but your cart was not found. Please contact support with Payment ID: ${razorpay_payment_id} for assistance.`);
      return res.redirect('/user/cart');
    }

    // Identify valid items vs orphaned/deleted products
    const initialCount = cart.items.length;
    const validItems = cart.items.filter(item => item.productId && item.productId.pricePerKg != null);

    // Remove orphaned cart items and persist cleaned cart
    if (validItems.length !== initialCount) {
      cart.items = validItems;
      await cart.save();
    }

    // If no valid items remain, do not create an order
    if (validItems.length === 0) {
      console.error(`[PAYMENT_RECONCILIATION_REQUIRED] User ${req.session.user._id} payment verified (Payment ID: ${razorpay_payment_id}, Order ID: ${razorpay_order_id}), but all cart items were deleted or unavailable.`);
      req.flash('error', `Payment was received (${razorpay_payment_id}), but the items are no longer available. Please contact support with Payment ID: ${razorpay_payment_id} for a refund.`);
      return res.redirect('/user/cart');
    }

    // Verify paid amount against current valid cart total to prevent mismatched orders
    const currentTotalPaise = validItems.reduce((sum, item) => {
      const price = item.productId ? item.productId.pricePerKg : 0;
      return sum + Math.round(price * item.quantity * 100);
    }, 0);

    let rzpOrder;
    try {
      rzpOrder = await razorpay.orders.fetch(razorpay_order_id);
    } catch (fetchErr) {
      console.error('Failed to fetch Razorpay order for amount verification:', fetchErr.message);
    }

    if (rzpOrder && rzpOrder.amount !== currentTotalPaise) {
      console.error(`[PAYMENT_RECONCILIATION_REQUIRED] Amount mismatch for user ${req.session.user._id}: Razorpay order amount ${rzpOrder.amount} paise vs cart total ${currentTotalPaise} paise. Payment ID: ${razorpay_payment_id}, Order ID: ${razorpay_order_id}.`);
      req.flash('error', `Payment was received (${razorpay_payment_id}), but your cart items changed during checkout. Please contact support with Payment ID: ${razorpay_payment_id} for reconciliation.`);
      return res.redirect('/user/cart');
    }

    // Valid items and amount verified: construct safe order items
    const items = validItems.map(item => ({
      productId: item.productId._id,
      quantity: item.quantity,
      price: item.productId.pricePerKg
    }));

    const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = new Order({
      userId: req.session.user._id,
      items,
      totalPrice,
      paymentStatus: 'Paid',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

    await order.save();

    // Clear the cart
    cart.items = [];
    await cart.save();

    req.flash('success', 'Payment successful! Your order has been placed.');
    res.redirect('/user/orders');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error processing payment.');
    res.redirect('/user/checkout');
  }
});

module.exports = router;