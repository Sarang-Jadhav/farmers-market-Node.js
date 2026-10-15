// Checks if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  req.flash('error', 'Please log in to continue.');
  res.redirect('/auth/login');
};

// Checks if user is NOT logged in (for auth pages)
const isGuest = (req, res, next) => {
  if (!req.session.user) return next();
  if (req.session.user.role === 'farmer') return res.redirect('/farmer/dashboard');
  return res.redirect('/user/dashboard');
};

module.exports = { isAuthenticated, isGuest };