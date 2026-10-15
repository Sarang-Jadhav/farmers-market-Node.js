const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { isAuthenticated } = require('../middleware/auth');
const { isFarmer } = require('../middleware/role');

// Multer config for product images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/images/'),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueName + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files are allowed.'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Helper: validate and parse stock input
const parseStock = (stockInput) => {
  // If genuinely missing or empty, preserve existing default of 100
  if (stockInput === undefined || stockInput === null || (typeof stockInput === 'string' && stockInput.trim() === '')) {
    return { valid: true, value: 100 };
  }

  // Handle number type (e.g. if passed programmatically or parsed JSON)
  if (typeof stockInput === 'number') {
    if (Number.isInteger(stockInput) && Number.isSafeInteger(stockInput) && stockInput >= 0) {
      return { valid: true, value: stockInput };
    }
    return { valid: false, error: 'Stock must be a non-negative whole number (0 or greater).' };
  }

  // Handle string type (standard form submission)
  const trimmed = stockInput.toString().trim();
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: 'Stock must be a non-negative whole number (0 or greater).' };
  }

  const parsed = parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { valid: false, error: 'Stock must be a non-negative whole number (0 or greater).' };
  }

  return { valid: true, value: parsed };
};

// Apply auth + role middleware to all farmer routes
router.use(isAuthenticated, isFarmer);

// GET /farmer/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const productCount = await Product.countDocuments({ farmerId: req.session.user._id });
    const products = await Product.find({ farmerId: req.session.user._id }).sort({ createdAt: -1 }).limit(5);

    // Orders involving this farmer's products
    const myProductIds = (await Product.find({ farmerId: req.session.user._id }, '_id')).map(p => p._id);
    const recentOrders = await Order.find({ 'items.productId': { $in: myProductIds } })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('farmer/dashboard', {
      title: 'Farmer Dashboard',
      productCount,
      products,
      recentOrders
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading dashboard.');
    res.redirect('/');
  }
});

// GET /farmer/products
router.get('/products', async (req, res) => {
  try {
    const products = await Product.find({ farmerId: req.session.user._id }).sort({ createdAt: -1 });
    res.render('farmer/manage-products', { title: 'My Products', products });
  } catch (err) {
    req.flash('error', 'Error fetching products.');
    res.redirect('/farmer/dashboard');
  }
});

// GET /farmer/products/add
router.get('/products/add', (req, res) => {
  res.render('farmer/add-product', { title: 'Add Product' });
});

// POST /farmer/products/add
router.post('/products/add', upload.single('image'), async (req, res) => {
  try {
    const { name, pricePerKg, description, stock } = req.body;
    const stockValidation = parseStock(stock);

    if (!stockValidation.valid) {
      req.flash('error', stockValidation.error);
      return res.redirect('/farmer/products/add');
    }

    const image = req.file ? req.file.filename : 'default-product.jpg';

    const product = new Product({
      farmerId: req.session.user._id,
      name,
      pricePerKg: parseFloat(pricePerKg),
      description,
      image,
      stock: stockValidation.value
    });

    await product.save();
    req.flash('success', 'Product added successfully.');
    res.redirect('/farmer/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add product.');
    res.redirect('/farmer/products/add');
  }
});

// GET /farmer/products/edit/:id
router.get('/products/edit/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, farmerId: req.session.user._id });
    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/farmer/products');
    }
    res.render('farmer/add-product', { title: 'Edit Product', product });
  } catch (err) {
    req.flash('error', 'Error fetching product.');
    res.redirect('/farmer/products');
  }
});

// POST /farmer/products/edit/:id
router.post('/products/edit/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, pricePerKg, description, stock } = req.body;
    const product = await Product.findOne({ _id: req.params.id, farmerId: req.session.user._id });

    if (!product) {
      req.flash('error', 'Product not found.');
      return res.redirect('/farmer/products');
    }

    const stockValidation = parseStock(stock);
    if (!stockValidation.valid) {
      req.flash('error', stockValidation.error);
      return res.redirect(`/farmer/products/edit/${req.params.id}`);
    }

    product.name = name;
    product.pricePerKg = parseFloat(pricePerKg);
    product.description = description;
    product.stock = stockValidation.value;
    if (req.file) product.image = req.file.filename;

    await product.save();
    req.flash('success', 'Product updated successfully.');
    res.redirect('/farmer/products');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update product.');
    res.redirect(`/farmer/products/edit/${req.params.id}`);
  }
});

// POST /farmer/products/delete/:id
router.post('/products/delete/:id', async (req, res) => {
  try {
    await Product.findOneAndDelete({ _id: req.params.id, farmerId: req.session.user._id });
    req.flash('success', 'Product deleted.');
    res.redirect('/farmer/products');
  } catch (err) {
    req.flash('error', 'Failed to delete product.');
    res.redirect('/farmer/products');
  }
});

// GET /farmer/orders
router.get('/orders', async (req, res) => {
  try {
    const myProductIds = (await Product.find({ farmerId: req.session.user._id }, '_id')).map(p => p._id);

    const orders = await Order.find({ 'items.productId': { $in: myProductIds } })
      .populate('userId', 'name email')
      .populate('items.productId', 'name pricePerKg image')
      .sort({ createdAt: -1 });

    // Filter each order's items to only show THIS farmer's products
    const filteredOrders = orders.map(order => {
      const farmerItems = order.items.filter(item =>
        item.productId && myProductIds.some(id => id.equals(item.productId._id))
      );
      return { ...order.toObject(), items: farmerItems };
    });

    res.render('farmer/orders', { title: 'Orders', orders: filteredOrders });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error fetching orders.');
    res.redirect('/farmer/dashboard');
  }
});

module.exports = router;