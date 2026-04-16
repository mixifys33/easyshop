const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const getUser = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// GET /api/wishlist
router.get('/', getUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const wishlist = user?.wishlist?.map(id => id.toString()) || [];
    res.json({ success: true, wishlist });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch wishlist', error: error.message });
  }
});

// POST /api/wishlist/add
router.post('/add', getUser, async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.userId);
    if (!user.wishlist.map(id => id.toString()).includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }
    res.json({ success: true, wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add to wishlist', error: error.message });
  }
});

// POST /api/wishlist/remove
router.post('/remove', getUser, async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.userId);
    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();
    res.json({ success: true, wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove from wishlist', error: error.message });
  }
});

// POST /api/wishlist/toggle
router.post('/toggle', getUser, async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.userId);
    const ids = user.wishlist.map(id => id.toString());
    if (ids.includes(productId)) {
      user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    } else {
      user.wishlist.push(productId);
    }
    await user.save();
    res.json({ success: true, wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ message: 'Failed to toggle wishlist', error: error.message });
  }
});

// POST /api/wishlist/sync
router.post('/sync', getUser, async (req, res) => {
  try {
    const { productIds } = req.body;
    const user = await User.findById(req.userId);
    user.wishlist = productIds;
    await user.save();
    res.json({ success: true, wishlist: user.wishlist });
  } catch (error) {
    res.status(500).json({ message: 'Failed to sync wishlist', error: error.message });
  }
});

module.exports = router;
