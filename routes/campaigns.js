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

// POST create campaign  â€” must be before /:id routes
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

const normalizeDiscountType = (discountType) => {
  if (discountType === 'fixed_amount') return 'fixed';
  return discountType;
};

const isCampaignCurrentlyActive = (campaign) => {
  if (campaign.status === 'paused') return false;
  const now = new Date();
  return (
    campaign.status === 'active' &&
    new Date(campaign.startDate) <= now &&
    new Date(campaign.endDate) >= now
  );
};

const cartItemMatchesCampaign = (item, campaign) => {
  const itemSeller = item.shopId || item.sellerId;
  if (!itemSeller || String(itemSeller) !== String(campaign.sellerId)) return false;

  if (campaign.appliesTo === 'all_products') return true;
  if (campaign.appliesTo === 'specific_products') {
    return (campaign.productIds || []).some((id) => String(id) === String(item.id));
  }
  if (campaign.appliesTo === 'specific_categories') {
    return item.appCategory && (campaign.categories || []).includes(item.appCategory);
  }
  return false;
};

// POST /validate-coupon — used by marketplace cart/checkout
router.post('/validate-coupon', async (req, res) => {
  try {
    const { code, cartItems = [], applicationId, total = 0 } = req.body;
    const upperCode = String(code || '').trim().toUpperCase();

    if (!upperCode) {
      return res.status(400).json({ valid: false, message: 'Please enter a coupon code' });
    }

    const sellerIds = [
      ...new Set(
        cartItems.map((item) => item.shopId || item.sellerId).filter(Boolean)
      ),
    ];

    if (!sellerIds.length) {
      return res.status(400).json({ valid: false, message: 'No seller found for items in cart' });
    }

    const now = new Date();
    let campaign = null;

    for (const sellerId of sellerIds) {
      const found = await Campaign.findOne({
        sellerId,
        couponCode: upperCode,
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now },
      }).lean();
      if (found) {
        campaign = found;
        break;
      }
    }

    if (!campaign) {
      return res.json({ valid: false, message: 'Invalid or expired coupon code' });
    }

    if (campaign.maxUsage != null && campaign.usageCount >= campaign.maxUsage) {
      return res.json({ valid: false, message: 'This coupon has reached its usage limit' });
    }

    let eligibleItems = cartItems.filter((item) => cartItemMatchesCampaign(item, campaign));

    if (applicationId) {
      eligibleItems = eligibleItems.filter((item) => String(item.id) === String(applicationId));
      if (!eligibleItems.length) {
        return res.json({
          valid: false,
          message: 'This coupon does not apply to this application',
        });
      }
    }

    if (!eligibleItems.length) {
      return res.json({
        valid: false,
        message: 'This coupon does not apply to applications in your cart',
      });
    }

    const baseAmount = applicationId
      ? Number(eligibleItems[0]?.price) || 0
      : eligibleItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

    if (campaign.minOrderAmount && baseAmount < campaign.minOrderAmount) {
      return res.json({
        valid: false,
        message: `Minimum order of USD ${Number(campaign.minOrderAmount).toLocaleString()} required for this coupon`,
      });
    }

    const discountType = normalizeDiscountType(campaign.discountType);
    let discountAmount = 0;

    if (discountType === 'percentage') {
      discountAmount = Math.round(baseAmount * (campaign.discountValue / 100) * 100) / 100;
    } else if (discountType === 'fixed') {
      discountAmount = Math.min(campaign.discountValue, baseAmount);
    }

    const discountLabel =
      discountType === 'percentage'
        ? `${campaign.discountValue}% off`
        : `USD ${Number(campaign.discountValue).toLocaleString()} off`;

    return res.json({
      valid: true,
      type: discountType === 'percentage' ? 'percentage' : 'fixed',
      value: campaign.discountValue,
      discountAmount,
      message: `${campaign.title} — ${discountLabel}`,
      createdBy: 'seller',
      campaignId: campaign._id,
      sellerId: campaign.sellerId,
      appliesTo: campaign.appliesTo,
      affectedApplicationCount: eligibleItems.length,
    });
  } catch (err) {
    console.error('[campaigns/validate-coupon]', err);
    res.status(500).json({ valid: false, message: 'Failed to validate coupon' });
  }
});

// GET /active — public endpoint for the offers page (must be before /:id)
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const Application = require('../models/Application');
    const Seller  = require('../models/Seller');

    // Live campaigns: within date window, not paused/ended (includes active + draft in-range)
    const campaigns = await Campaign.find({
      startDate: { $lte: now },
      endDate: { $gte: now },
      status: { $nin: ['paused', 'ended'] },
    }).sort({ createdAt: -1 }).lean();

    const appSelect =
      'appName slug price currency screenshots appCategory adminRating _id sellerId isFree';

    const enriched = await Promise.all(campaigns.map(async (c) => {
      let applications = [];
      const appQuery = { isDraft: false, verificationStatus: 'verified', isActive: true };

      if (c.appliesTo === 'specific_products' && c.productIds?.length) {
        applications = await Application.find({ _id: { $in: c.productIds }, ...appQuery })
          .select(appSelect)
          .lean();
      } else if (c.appliesTo === 'specific_categories' && c.categories?.length) {
        applications = await Application.find({
          appCategory: { $in: c.categories },
          sellerId: c.sellerId,
          ...appQuery,
        })
          .select(appSelect)
          .lean();
      } else {
        applications = await Application.find({ sellerId: c.sellerId, ...appQuery })
          .select(appSelect)
          .lean();
      }

      const dtype = normalizeDiscountType(c.discountType);
      const mappedProducts = applications.map((p) => {
        const base = Number(p.price) || 0;
        let discounted = base;
        if (dtype === 'percentage') {
          discounted = Math.round(base * (1 - c.discountValue / 100) * 100) / 100;
        } else if (dtype === 'fixed') {
          discounted = Math.max(0, base - c.discountValue);
        }
        const currency = 'USD';
        return {
          id: p._id,
          title: p.appName,
          slug: p.slug || String(p._id),
          sale_price: base,
          regular_price: base,
          discounted_price: discounted,
          image: p.screenshots?.[0]?.url || null,
          category: p.appCategory,
          brand: null,
          stock: 1,
          ratings: p.adminRating || 0,
          savings: Math.max(0, base - discounted),
          currency,
          sellerId: p.sellerId || c.sellerId,
          isFree: p.isFree === true || base === 0,
          couponCode: c.couponCode || null,
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
        sellerId: c.sellerId,
        products: mappedProducts,
        shopName: seller?.shop?.shopName || 'Seller',
        shopAvatar: seller?.profileImage?.url || seller?.shop?.logo?.url || null,
        productCount: mappedProducts.length,
      };
    }));

    // Only return campaigns that have at least one application to show buyers
    const withApps = enriched.filter((c) => c.products.length > 0);

    res.json({ success: true, campaigns: withApps, total: withApps.length });
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

