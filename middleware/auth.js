const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Seller = require('../models/Seller');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired', error: 'token_expired' });
    }
    res.status(401).json({ message: 'Token is not valid' });
  }
};

// Enhanced authentication middleware that supports both Users and Sellers
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Try to find user first
    let user = await User.findById(decoded.userId).select('-password');
    let userType = 'User';
    
    // If not found as user, try as seller
    if (!user) {
      user = await Seller.findById(decoded.userId).select('-password');
      userType = 'Seller';
    }

    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token. User not found.' 
      });
    }

    // Add user info and type to request
    req.user = {
      id: user._id,
      ...user.toObject(),
      userType: userType
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired. Please login again.',
        error: 'token_expired' 
      });
    }
    
    return res.status(401).json({ 
      success: false,
      message: 'Invalid token.',
      error: error.message 
    });
  }
};

// Alias for auth (commonly used name)
const protect = auth;

// Admin-only middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ 
      success: false,
      message: 'Access denied. Admin only.' 
    });
  }
};

module.exports = { auth, authenticateToken, protect, adminOnly };