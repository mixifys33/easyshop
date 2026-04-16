const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// Middleware to get user from token
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

// GET /api/cart
router.get('/', getUser, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate('cart.productId');
    res.json({ success: true, cart: user?.cart || [] });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch cart', error: error.message });
  }
});

// POST /api/cart/add
router.post('/add', getUser, async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;
    const mongoose = require('mongoose');
    if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
      return res.status(400).json({ message: 'Invalid productId' });
    }
    const user = await User.findById(req.userId);
    const existing = user.cart.find(i => i.productId.toString() === String(productId));
    if (existing) {
      existing.quantity += quantity;
    } else {
      user.cart.push({ productId: String(productId), quantity });
    }
    await User.findByIdAndUpdate(req.userId, { $set: { cart: user.cart } }, { runValidators: false });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add to cart', error: error.message });
  }
});

// POST /api/cart/remove
router.post('/remove', getUser, async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.userId);
    const updatedCart = user.cart.filter(i => i.productId.toString() !== String(productId));
    await User.findByIdAndUpdate(req.userId, { $set: { cart: updatedCart } }, { runValidators: false });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove from cart', error: error.message });
  }
});

// POST /api/cart/update-quantity
router.post('/update-quantity', getUser, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const user = await User.findById(req.userId);
    const item = user.cart.find(i => i.productId.toString() === String(productId));
    if (item) item.quantity = quantity;
    await User.findByIdAndUpdate(req.userId, { $set: { cart: user.cart } }, { runValidators: false });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update cart', error: error.message });
  }
});

// POST /api/cart/sync
router.post('/sync', getUser, async (req, res) => {
  try {
    const { items } = req.body;
    const mongoose = require('mongoose');

    // Filter out items with invalid or missing productIds to prevent CastError
    const validItems = (items || [])
      .filter(i => i.productId && mongoose.Types.ObjectId.isValid(String(i.productId)))
      .map(i => ({ productId: String(i.productId), quantity: Number(i.quantity) || 1 }));

    // Use findByIdAndUpdate with $set to avoid triggering full schema validation
    // (prevents failures from unrelated fields like gender enum)
    await User.findByIdAndUpdate(
      req.userId,
      { $set: { cart: validItems } },
      { runValidators: false }
    );

    res.json({ success: true, skipped: (items || []).length - validItems.length });
  } catch (error) {
    console.error('Cart sync error:', error.message);
    res.status(500).json({ message: 'Failed to sync cart', error: error.message });
  }
});

module.exports = router;
