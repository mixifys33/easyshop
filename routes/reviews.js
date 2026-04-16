const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const router = express.Router();

// Simple Review schema
const reviewSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: String },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String },
  review: { type: String },
  images: [{ type: String }],
}, { timestamps: true });

const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);

const getUser = (req) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
};

// GET /api/reviews?productId=xxx
router.get('/', async (req, res) => {
  try {
    const { productId } = req.query;
    if (!productId) return res.status(400).json({ message: 'productId is required' });

    const reviews = await Review.find({ productId })
      .populate('userId', 'name avatar')
      .sort({ createdAt: -1 });

    const total = reviews.length;
    const average = total > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / total
      : 0;

    const distribution = reviews.reduce((acc, r) => {
      acc[r.rating] = (acc[r.rating] || 0) + 1;
      return acc;
    }, {});

    res.json({ success: true, reviews, stats: { average: Math.round(average * 10) / 10, total, distribution } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch reviews', error: error.message });
  }
});

// POST /api/reviews
router.post('/', async (req, res) => {
  try {
    const decoded = getUser(req);
    if (!decoded) return res.status(401).json({ message: 'Authentication required' });

    const { productId, orderId, rating, title, review, images } = req.body;
    if (!productId || !rating) {
      return res.status(400).json({ message: 'productId and rating are required' });
    }

    const newReview = await Review.create({
      productId,
      userId: decoded.userId,
      orderId,
      rating,
      title,
      review,
      images: images || [],
    });

    const populated = await newReview.populate('userId', 'name avatar');
    res.status(201).json({ success: true, review: populated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit review', error: error.message });
  }
});

module.exports = router;
