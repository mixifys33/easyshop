const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const User = require('../models/User');
const {
  sendOrderConfirmationToUser,
  sendNewOrderToSeller,
  sendCancellationToSeller,
  sendCancellationToUser,
  sendRefundCompletedToUser,
} = require('../services/emailService');

const orderSchema = new mongoose.Schema({
  userId: { type: String },
  orderRef: { type: String, index: true },
  sellerId: { type: String },
  items: [{
    productId: String,
    name: String,
    price: Number,
    quantity: Number,
    image: String,
  }],
  delivery: {
    type: { type: String },
    name: String,
    fee: Number,
    estimatedDays: String,
  },
  paymentMethod: String,
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number,
  deliveryFee: Number,
  customerInfo: {
    fullName: String,
    phone: String,
    address: String,
    city: String,
    notes: String,
  },
  buyerInfo: {
    userId: String,
    name: String,
    email: String,
    phone: String,
  },
  proofImages: [{
    url: String,
    fileId: String,
    uploadedAt: { type: Date, default: Date.now },
  }],
  refundDetails: {
    method: String,
    reference: String,
    notes: String,
    refundNumber: String,
    completedAt: Date,
    proofImages: [{
      url: String,
      fileId: String,
    }],
  },
}, { timestamps: true });

// Force fresh model registration — avoids stale cached schema without refundDetails
if (mongoose.models.CustomerOrder) {
  delete mongoose.models.CustomerOrder;
}
const CustomerOrder = mongoose.model('CustomerOrder', orderSchema);

// POST /api/orders — place a new order + send confirmation emails
router.post('/', async (req, res) => {
  try {
    const { userId, sellerId, items, paymentMethod } = req.body;

    if (!userId) console.warn('[orders] POST missing userId, body:', JSON.stringify(req.body).slice(0, 300));
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Order must have at least one item' });
    }

    const order = new CustomerOrder(req.body);
    await order.save();
    console.log('[orders] Created order:', order._id, 'userId:', userId, 'seller:', sellerId, 'method:', paymentMethod);

    // Send emails in background — don't block the response
    setImmediate(async () => {
      try {
        // Get buyer email
        let buyerEmail = order.buyerInfo?.email || null;
        let buyerName = order.buyerInfo?.name || order.customerInfo?.fullName || 'Customer';
        if (!buyerEmail && userId) {
          const user = await User.findById(userId).select('email name').catch(() => null);
          if (user) { buyerEmail = user.email; buyerName = user.name || buyerName; }
        }

        // Get seller email
        let sellerEmail = null;
        let sellerName = 'Seller';
        if (sellerId) {
          const seller = await Seller.findById(sellerId).select('email name shop').catch(() => null);
          if (seller) {
            sellerEmail = seller.email;
            sellerName = seller.shop?.shopName || seller.name || 'Seller';
          }
        }

        if (buyerEmail) await sendOrderConfirmationToUser(buyerEmail, buyerName, order);
        if (sellerEmail) await sendNewOrderToSeller(sellerEmail, sellerName, order, buyerName);
      } catch (emailErr) {
        console.error('[orders] Email send error:', emailErr.message);
      }
    });

    res.status(201).json({ success: true, orderId: order._id });
  } catch (e) {
    console.error('[orders] Order creation error:', e.message, e.errors ? JSON.stringify(e.errors) : '');
    res.status(500).json({ error: 'Failed to create order', detail: e.message });
  }
});

// GET /api/orders
router.get('/', async (req, res) => {
  try {
    const { userId, sellerId } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (sellerId) filter.sellerId = sellerId;
    const orders = await CustomerOrder.find(filter).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id — fetch a single order by ID
router.get('/:id', async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PATCH /api/orders/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await CustomerOrder.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// POST /api/orders/:id/cancel — cancel order + trigger refund emails
router.post('/:id/cancel', async (req, res) => {
  try {
    const order = await CustomerOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (['cancelled', 'refund_in_progress'].includes(order.status)) {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }
    if (['delivered', 'shipped'].includes(order.status)) {
      return res.status(400).json({ error: 'Cannot cancel an order that has already been shipped or delivered' });
    }

    order.status = 'refund_in_progress';
    order.paymentStatus = 'refund_pending';
    await order.save();

    // Send cancellation emails in background
    setImmediate(async () => {
      try {
        let buyerEmail = order.buyerInfo?.email || null;
        let buyerName = order.buyerInfo?.name || order.customerInfo?.fullName || 'Customer';
        if (!buyerEmail && order.userId) {
          const user = await User.findById(order.userId).select('email name').catch(() => null);
          if (user) { buyerEmail = user.email; buyerName = user.name || buyerName; }
        }

        let sellerEmail = null;
        let sellerName = 'Seller';
        if (order.sellerId) {
          const seller = await Seller.findById(order.sellerId).select('email name shop').catch(() => null);
          if (seller) {
            sellerEmail = seller.email;
            sellerName = seller.shop?.shopName || seller.name || 'Seller';
          }
        }

        if (sellerEmail) await sendCancellationToSeller(sellerEmail, sellerName, order, buyerName, buyerEmail);
        if (buyerEmail) await sendCancellationToUser(buyerEmail, buyerName, order);
      } catch (emailErr) {
        console.error('[orders] Cancellation email error:', emailErr.message);
      }
    });

    res.json({ success: true, order });
  } catch (e) {
    console.error('[orders] Cancel error:', e.message);
    res.status(500).json({ error: 'Failed to cancel order', detail: e.message });
  }
});

// POST /api/orders/:id/complete-refund — seller marks refund as done
router.post('/:id/complete-refund', async (req, res) => {
  try {
    const { method, reference, notes, refundNumber, proofImages } = req.body;

    const order = await CustomerOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.status !== 'refund_in_progress') {
      return res.status(400).json({ error: 'Order is not in refund_in_progress state' });
    }

    const refundDetails = {
      method:       method       || null,
      reference:    reference    || null,
      notes:        notes        || null,
      refundNumber: refundNumber || null,
      completedAt:  new Date(),
      proofImages:  proofImages  || [],
    };

    // Use findByIdAndUpdate + $set to guarantee the nested object is written
    const updated = await CustomerOrder.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status:        'cancelled',
          paymentStatus: 'refunded',
          refundDetails,
        },
      },
      { new: true }
    );

    console.log('[orders] Refund completed for order:', updated._id, '| refundDetails:', JSON.stringify(refundDetails));

    // Send refund completed email to buyer in background
    setImmediate(async () => {
      try {
        let buyerEmail = updated.buyerInfo?.email || null;
        let buyerName  = updated.buyerInfo?.name || updated.customerInfo?.fullName || 'Customer';
        if (!buyerEmail && updated.userId) {
          const user = await User.findById(updated.userId).select('email name').catch(() => null);
          if (user) { buyerEmail = user.email; buyerName = user.name || buyerName; }
        }
        if (buyerEmail) await sendRefundCompletedToUser(buyerEmail, buyerName, updated, { method, reference, notes });
      } catch (emailErr) {
        console.error('[orders] Refund completed email error:', emailErr.message);
      }
    });

    res.json({ success: true, order: updated });
  } catch (e) {
    console.error('[orders] Complete refund error:', e.message);
    res.status(500).json({ error: 'Failed to complete refund', detail: e.message });
  }
});

// PATCH /api/orders/:id/proof
router.patch('/:id/proof', async (req, res) => {
  try {
    const { proofImages } = req.body;
    const order = await CustomerOrder.findByIdAndUpdate(
      req.params.id,
      { $set: { proofImages, paymentStatus: 'submitted' } },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update proof images' });
  }
});

module.exports = router;
