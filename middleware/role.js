const isFarmer = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'farmer') return next();
  req.flash('error', 'Access denied. Farmers only.');
  res.redirect('/');
};

const isCustomer = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'customer') return next();
  req.flash('error', 'Access denied. Customers only.');
  res.redirect('/');
};

module.exports = { isFarmer, isCustomer };