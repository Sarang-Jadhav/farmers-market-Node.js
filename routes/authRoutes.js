const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isGuest } = require('../middleware/auth');

// GET /auth/register
router.get('/register', isGuest, (req, res) => {
  res.render('auth/register', { title: 'Register' });
});

// POST /auth/register
router.post('/register', isGuest, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!['farmer', 'customer'].includes(role)) {
      req.flash('error', 'Invalid role selected.');
      return res.redirect('/auth/register');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      req.flash('error', 'Email already registered.');
      return res.redirect('/auth/register');
    }

    const user = new User({ name, email, password, role });
    await user.save();

    req.flash('success', 'Registration successful. Please log in.');
    res.redirect('/auth/login');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Registration failed. Try again.');
    res.redirect('/auth/register');
  }
});

// GET /auth/login
router.get('/login', isGuest, (req, res) => {
  res.render('auth/login', { title: 'Login' });
});

// POST /auth/login
router.post('/login', isGuest, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/auth/login');
    }

    req.session.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    req.flash('success', `Welcome back, ${user.name}!`);
    if (user.role === 'farmer') return res.redirect('/farmer/dashboard');
    return res.redirect('/user/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed. Try again.');
    res.redirect('/auth/login');
  }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;