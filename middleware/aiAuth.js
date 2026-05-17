/**
 * AI Authentication Middleware
 * Checks user login status and provides context to AI routes
 * Unlogged users are allowed but flagged in context for login reminders
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Seller = require('../models/Seller');

const aiAuth = async (req, res, next) => {
  try {
    // Try to extract token from Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    let user = null;
    let userId = null;

    // If token exists, verify and fetch user
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Try to find as User first
        user = await User.findById(decoded.userId).select('-password').lean();
        
        // If not found, try as Seller
        if (!user) {
          user = await Seller.findById(decoded.userId).select('-password').lean();
        }
        
        if (user) {
          userId = decoded.userId;
        }
      } catch (tokenErr) {
        console.log('AI Auth: Invalid or expired token:', tokenErr.message);
        // Continue as unlogged user
      }
    }

    // Add AI context to request
    req.aiContext = {
      isLoggedIn: !!user,
      userId: userId,
      userEmail: user?.email || null,
      userName: user?.name || user?.shopName || null,
      userTier: user?.tier || 'free',
      hasCompletedProfile: user?.hasCompletedProfile || false,
      purchasedApplications: user?.purchasedApplications || [],
      downloadedApplications: user?.downloadedApplications || [],
      requestTimestamp: Date.now(),
    };

    // Also attach user to req for optional use
    if (user) {
      req.user = user;
    }

    // Log AI interaction
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[AI Access] ${req.aiContext.isLoggedIn ? `User: ${user?.email}` : 'Unlogged User'} | Path: ${req.path}`);
    }

    next();
  } catch (error) {
    console.error('AI auth middleware error:', error);
    // Don't block request on middleware error - allow unlogged access
    req.aiContext = {
      isLoggedIn: false,
      userId: null,
      userEmail: null,
      userName: null,
      userTier: 'free',
      hasCompletedProfile: false,
      purchasedApplications: [],
      downloadedApplications: [],
      requestTimestamp: Date.now(),
    };
    next();
  }
};

module.exports = aiAuth;
