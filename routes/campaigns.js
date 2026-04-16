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

// GET /active — public endpoint for the offers page (must be before /:id)
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const Product = require('../models/Product');
    const Seller  = require('../models/Seller');

    const campaigns = await Campaign.find({
      status: 'active',
      startDate: { $lte: now },
      endDate:   { $gte: now },
    }).sort({ createdAt: -1 }).lean();

    const enriched = await Promise.all(campaigns.map(async (c) => {
      let products = [];
      if (c.appliesTo === 'specific_products' && c.productIds?.length) {
        products = await Product.find({ _id: { $in: c.productIds }, status: 'active', isDraft: { $ne: true } })
          .select('title slug salePrice regularPrice images category brand stock ratings _id')
          .lean();
      } else if (c.appliesTo === 'specific_categories' && c.categories?.length) {
        products = await Product.find({ category: { $in: c.categories }, status: 'active', isDraft: { $ne: true } })
          .select('title slug salePrice regularPrice images category brand stock ratings _id')
          .limit(12).lean();
      } else {
        products = await Product.find({ sellerId: c.sellerId, status: 'active', isDraft: { $ne: true } })
          .select('title slug salePrice regularPrice images category brand stock ratings _id')
          .limit(12).lean();
      }

      const mappedProducts = products.map(p => {
        const base = p.salePrice || p.regularPrice || 0;
        let discounted = base;
        if (c.discountType === 'percentage') discounted = Math.round(base * (1 - c.discountValue / 100));
        else if (c.discountType === 'fixed')  discounted = Math.max(0, base - c.discountValue);
        return {
          id: p._id,
          title: p.title,
          slug: p.slug || p._id,
          sale_price: base,
          regular_price: p.regularPrice || base,
          discounted_price: discounted,
          image: p.images?.[0]?.url || null,
          category: p.category,
          brand: p.brand,
          stock: p.stock,
          ratings: p.ratings || 0,
          savings: base - discounted,
        };
      });

      const seller = await Seller.findById(c.sellerId).select('shop.shopName shop.logo profileImage').lean();

      return {
        id: c._id,
        title: c.title,
        description: c.description,
        type: c.type,
        discountType: c.discountType,
        discountValue: c.discountValue,
        minOrderAmount: c.minOrderAmount,
        couponCode: c.couponCode,
        bannerColor: c.bannerColor || '#e74c3c',
        startDate: c.startDate,
        endDate: c.endDate,
        appliesTo: c.appliesTo,
        products: mappedProducts,
        shopName: seller?.shop?.shopName || 'EasyShop',
        shopAvatar: seller?.profileImage?.url || seller?.shop?.logo?.url || null,
        productCount: mappedProducts.length,
      };
    }));

    res.json({ success: true, campaigns: enriched, total: enriched.length });
  } catch (err) {
    console.error('[campaigns/active]', err.message);
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
