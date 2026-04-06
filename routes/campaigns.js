const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');

// Helper: compute correct status from dates
const computeStatus = (c) => {
  if (c.status === 'paused') return 'paused';
  const now = new Date();
  if (now < new Date(c.startDate)) return 'draft';
  if (now > new Date(c.endDate))   return 'ended';
  return 'active';
};

// GET all campaigns for a seller
router.get('/seller/:sellerId', async (req, res) => {
  try {
    const campaigns = await Campaign.find({ sellerId: req.params.sellerId }).sort({ createdAt: -1 });
    // Sync statuses without triggering pre-save hook issues
    for (const c of campaigns) {
      const correct = computeStatus(c);
      if (correct !== c.status) {
        await Campaign.findByIdAndUpdate(c._id, { status: correct });
        c.status = correct;
      }
    }
    res.json({ success: true, campaigns });
  } catch (err) {
    console.error('GET /seller error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create campaign  — must be before /:id routes
router.post('/', async (req, res) => {
  try {
    const {
      sellerId, title, description, type, discountType, discountValue,
      minOrderAmount, maxUsage, couponCode, appliesTo, productIds,
      categories, startDate, endDate, bannerColor,
    } = req.body;

    if (!sellerId || !title || !type || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'sellerId, title, type, startDate, endDate are required' });
    }
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ success: false, message: 'End date must be after start date' });
    }
    if (couponCode) {
      const existing = await Campaign.findOne({ sellerId, couponCode: couponCode.toUpperCase() });
      if (existing) return res.status(409).json({ success: false, message: 'Coupon code already in use' });
    }

    const campaign = new Campaign({
      sellerId, title, description, type, discountType, discountValue,
      minOrderAmount, maxUsage, couponCode, appliesTo, productIds,
      categories, startDate, endDate, bannerColor,
    });
    await campaign.save();
    res.status(201).json({ success: true, campaign });
  } catch (err) {
    console.error('POST / error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET single campaign
router.get('/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, campaign });
  } catch (err) {
    console.error('GET /:id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update campaign
router.put('/:id', async (req, res) => {
  try {
    const allowed = [
      'title', 'description', 'type', 'discountType', 'discountValue',
      'minOrderAmount', 'maxUsage', 'couponCode', 'appliesTo', 'productIds',
      'categories', 'startDate', 'endDate', 'bannerColor', 'status',
    ];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const campaign = await Campaign.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, campaign });
  } catch (err) {
    console.error('PUT /:id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH toggle status (active <-> paused)
router.patch('/:id/toggle', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status === 'ended') {
      return res.status(400).json({ success: false, message: 'Cannot toggle an ended campaign' });
    }
    const newStatus = campaign.status === 'paused' ? computeStatus({ ...campaign.toObject(), status: 'active' }) : 'paused';
    const updated = await Campaign.findByIdAndUpdate(req.params.id, { status: newStatus }, { new: true });
    res.json({ success: true, campaign: updated });
  } catch (err) {
    console.error('PATCH /:id/toggle error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE campaign
router.delete('/:id', async (req, res) => {
  try {
    console.log('DELETE campaign request for id:', req.params.id);
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) {
      console.log('Campaign not found for id:', req.params.id);
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    console.log('Campaign deleted successfully:', campaign.title);
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (err) {
    console.error('DELETE /:id error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
