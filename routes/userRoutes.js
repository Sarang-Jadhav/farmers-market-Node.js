const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const { isAuthenticated } = require('../middleware/auth');
const { isCustomer } = require('../middleware/role');

router.use(isAuthenticated, isCustomer);

// GET /user/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const products = await Product.find().populate('farmerId', 'name').sort({ createdAt: -1 }).limit(6);
    const cart = await Cart.findOne({ userId: req.session.user._id });
    const cartCount = cart ? cart.items.length : 0;
    res.render('user/dashboard', { title: 'Customer Dashboard', products, cartCount });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading dashboard.');
    res.redirect('/');
  }
});

// GET /user/products
router.get('/products', async (req, res) => {
  try {
    const { search } = req.query;
    const query = search ? { name: { $regex: search, $options: 'i' } } : {};
    const products = await Product.find(query).populate('farmerId', 'name').sort({ createdAt: -1 });
    res.render('user/products', { title: 'All Products', products, search: search || '' });
  } catch (err) {
    req.flash('error', 'Error fetching products.');
    res.redirect('/user/dashboard');
  }
});

// POST /user/cart/add
router.post('/cart/add', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = parseFloat(quantity);

    if (!qty || qty <= 0) {
      req.flash('error', 'Invalid quantity.');
      return res.redirect('/user/products');
    }

    const product = await Product.findById(productId);
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/user/products');
    }

    let cart = await Cart.findOne({ userId: req.session.user._id });

    if (!cart) {
      cart = new Cart({ userId: req.session.user._id, items: [] });
    }

    const existingItem = cart.items.find(item => item.productId.toString() === productId);

    if (existingItem) {
      existingItem.quantity += qty;
    } else {
      cart.items.push({ productId, quantity: qty });
    }

    await cart.save();
    req.flash('success', `${product.name} added to cart.`);
    res.redirect('/user/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add to cart.');
    res.redirect('/user/products');
  }
});

// GET /user/cart
router.get('/cart', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.user._id })
      .populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.render('user/cart', { title: 'My Cart', cart: null, total: 0 });
    }

    // Filter out items whose referenced product was deleted
    const initialCount = cart.items.length;
    cart.items = cart.items.filter(item => item.productId && item.productId.pricePerKg != null);
    if (cart.items.length !== initialCount) {
      await cart.save();
    }

    if (cart.items.length === 0) {
      return res.render('user/cart', { title: 'My Cart', cart: null, total: 0 });
    }

    // Calculate total safely
    const total = cart.items.reduce((sum, item) => {
      const price = item.productId ? item.productId.pricePerKg : 0;
      return sum + (price * item.quantity);
    }, 0);

    res.render('user/cart', { title: 'My Cart', cart, total });
  } catch (err) {
    req.flash('error', 'Error fetching cart.');
    res.redirect('/user/dashboard');
  }
});

// POST /user/cart/update
router.post('/cart/update', async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = parseFloat(quantity);

    const cart = await Cart.findOne({ userId: req.session.user._id });
    if (!cart) return res.redirect('/user/cart');

    if (qty <= 0) {
      // Remove item if quantity is 0 or less
      cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    } else {
      const item = cart.items.find(item => item.productId.toString() === productId);
      if (item) item.quantity = qty;
    }

    await cart.save();
    res.redirect('/user/cart');
  } catch (err) {
    req.flash('error', 'Failed to update cart.');
    res.redirect('/user/cart');
  }
});

// POST /user/cart/remove
router.post('/cart/remove', async (req, res) => {
  try {
    const { productId } = req.body;
    const cart = await Cart.findOne({ userId: req.session.user._id });
    if (cart) {
      cart.items = cart.items.filter(item => item.productId.toString() !== productId);
      await cart.save();
    }
    req.flash('success', 'Item removed from cart.');
    res.redirect('/user/cart');
  } catch (err) {
    req.flash('error', 'Failed to remove item.');
    res.redirect('/user/cart');
  }
});

// GET /user/checkout
router.get('/checkout', async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.session.user._id }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      req.flash('error', 'Your cart is empty.');
      return res.redirect('/user/cart');
    }

    // Filter out items whose referenced product was deleted
    const initialCount = cart.items.length;
    cart.items = cart.items.filter(item => item.productId && item.productId.pricePerKg != null);
    if (cart.items.length !== initialCount) {
      await cart.save();
      req.flash('error', 'Some items were removed from your cart as they are no longer available.');
    }

    if (cart.items.length === 0) {
      return res.redirect('/user/cart');
    }

    const total = cart.items.reduce((sum, item) => {
      const price = item.productId ? item.productId.pricePerKg : 0;
      return sum + (price * item.quantity);
    }, 0);

    res.render('user/checkout', {
      title: 'Checkout',
      cart,
      total,
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    req.flash('error', 'Error loading checkout.');
    res.redirect('/user/cart');
  }
});

// GET /user/orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.session.user._id })
      .populate('items.productId', 'name image pricePerKg')
      .sort({ createdAt: -1 });
    res.render('user/orders', { title: 'My Orders', orders });
  } catch (err) {
    req.flash('error', 'Error fetching orders.');
    res.redirect('/user/dashboard');
  }
});

module.exports = router;