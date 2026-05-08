const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const {
  initializeCardPayment,
  initializeMobileMoneyPayment,
  initializeStandardPayment,
  verifyTransaction,
  verifyWebhookSignature,
  getTransactionByRef,
} = require('../services/flutterwaveService');

// Get or create CustomerOrder model
let CustomerOrder;
try {
  CustomerOrder = mongoose.model('CustomerOrder');
} catch {
  const orderSchema = new mongoose.Schema({
    userId: String,
    orderRef: String,
    sellerId: String,
    items: Array,
    delivery: Object,
    paymentMethod: String,
    paymentStatus: { type: String, default: 'pending' },
    status: { type: String, default: 'pending' },
    subtotal: Number,
    deliveryFee: Number,
    total: Number,
    customerInfo: Object,
    buyerInfo: Object,
    proofImages: Array,
    refundDetails: Object,
    flutterwaveData: {
      txRef: String,
      transactionId: String,
      paymentType: String,
      verifiedAt: Date,
    },
  }, { timestamps: true });
  CustomerOrder = mongoose.model('CustomerOrder', orderSchema);
}

/**
 * POST /api/flutterwave/initialize
 * Initialize a Flutterwave payment
 */
router.post('/initialize', async (req, res) => {
  try {
    const {
      orderId,
      paymentMethod,
      amount,
      currency,
      customerEmail,
      customerPhone,
      customerName,
      mobileProvider,
      redirectUrl,
    } = req.body;

    console.log('[Flutterwave] Initialize request:', {
      orderId,
      paymentMethod,
      amount,
      currency,
      customerEmail,
      customerPhone: customerPhone ? 'provided' : 'missing',
      customerName: customerName ? 'provided' : 'missing',
    });

    // Validate required fields
    if (!orderId || !amount || !customerEmail) {
      console.error('[Flutterwave] Missing required fields:', { orderId: !!orderId, amount: !!amount, customerEmail: !!customerEmail });
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: orderId, amount, customerEmail',
      });
    }

    // Fetch order to validate
    const order = await CustomerOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Generate unique transaction reference
    const txRef = `EASYSHOP-${orderId}-${Date.now()}`;

    const paymentData = {
      txRef,
      orderId,
      amount: parseFloat(amount),
      currency: currency || 'UGX',
      customerEmail,
      customerPhone: customerPhone || order.customerInfo?.phone,
      customerName: customerName || order.customerInfo?.fullName || 'Customer',
      redirectUrl: redirectUrl || `${process.env.FRONTEND_URL}/orders/${orderId}`,
      description: `Payment for order ${order.orderRef || orderId}`,
      mobileProvider,
    };

    let result;

    // Initialize payment based on method
    if (paymentMethod === 'flutterwave_card') {
      result = await initializeCardPayment(paymentData);
    } else if (paymentMethod === 'flutterwave_mobilemoney') {
      if (!customerPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is required for mobile money payment',
        });
      }
      result = await initializeMobileMoneyPayment(paymentData);
    } else {
      // Standard payment (all options)
      result = await initializeStandardPayment(paymentData);
    }

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Update order with transaction reference
    order.flutterwaveData = {
      txRef,
      transactionId: result.data?.id,
      paymentType: paymentMethod,
    };
    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'pending';
    await order.save();

    console.log(`[Flutterwave] Payment initialized for order ${orderId}, txRef: ${txRef}`);

    res.json({
      success: true,
      paymentLink: result.paymentLink,
      txRef,
      transactionId: result.data?.id,
      message: 'Payment initialized successfully',
    });
  } catch (error) {
    console.error('[Flutterwave] Initialize error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment',
      error: error.message,
    });
  }
});

/**
 * GET /api/flutterwave/verify/:transactionId
 * Verify a transaction by ID
 */
router.get('/verify/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const result = await verifyTransaction(transactionId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Find order by transaction reference
    const order = await CustomerOrder.findOne({
      'flutterwaveData.txRef': result.data.txRef,
    });

    if (order && result.verified) {
      // Update order status
      order.paymentStatus = 'paid';
      order.status = 'confirmed';
      order.flutterwaveData.transactionId = result.data.transactionId;
      order.flutterwaveData.verifiedAt = new Date();
      await order.save();

      console.log(`[Flutterwave] Payment verified for order ${order._id}`);
    }

    res.json({
      success: true,
      verified: result.verified,
      transaction: result.data,
      order: order ? {
        id: order._id,
        orderRef: order.orderRef,
        status: order.status,
        paymentStatus: order.paymentStatus,
      } : null,
    });
  } catch (error) {
    console.error('[Flutterwave] Verify error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify transaction',
      error: error.message,
    });
  }
});

/**
 * GET /api/flutterwave/verify-ref/:txRef
 * Verify a transaction by reference
 */
router.get('/verify-ref/:txRef', async (req, res) => {
  try {
    const { txRef } = req.params;

    const result = await getTransactionByRef(txRef);

    if (!result.success) {
      return res.status(400).json(result);
    }

    const transaction = result.data;
    const verified = transaction.status === 'successful';

    // Find order - first try by flutterwaveData.txRef, then by extracting orderId from txRef
    let order = await CustomerOrder.findOne({
      'flutterwaveData.txRef': txRef,
    });

    // If not found, try to extract orderId from txRef (format: EASYSHOP-{orderId}-{timestamp})
    if (!order) {
      const parts = txRef.split('-');
      if (parts.length >= 3 && parts[0] === 'EASYSHOP') {
        const orderId = parts.slice(1, -1).join('-'); // Get everything between EASYSHOP and timestamp
        order = await CustomerOrder.findById(orderId);
        
        if (order) {
          console.log(`[Flutterwave] Found order by extracting ID from txRef: ${orderId}`);
          // Initialize flutterwaveData if it doesn't exist
          if (!order.flutterwaveData) {
            order.flutterwaveData = {};
          }
          order.flutterwaveData.txRef = txRef;
        }
      }
    }

    if (order && verified) {
      // Update order status even if it was previously cancelled
      order.paymentStatus = 'paid';
      order.status = 'confirmed';
      if (!order.flutterwaveData) order.flutterwaveData = {};
      order.flutterwaveData.transactionId = transaction.id;
      order.flutterwaveData.verifiedAt = new Date();
      order.flutterwaveData.txRef = txRef;
      await order.save();

      console.log(`[Flutterwave] Payment verified by ref for order ${order._id}, status updated to confirmed`);
    } else if (order && !verified) {
      console.log(`[Flutterwave] Payment not verified for order ${order._id}, transaction status: ${transaction.status}`);
    } else if (!order) {
      console.log(`[Flutterwave] No order found for txRef: ${txRef}`);
    }

    res.json({
      success: true,
      verified,
      transaction,
      order: order ? {
        id: order._id,
        orderRef: order.orderRef,
        status: order.status,
        paymentStatus: order.paymentStatus,
      } : null,
    });
  } catch (error) {
    console.error('[Flutterwave] Verify by ref error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify transaction',
      error: error.message,
    });
  }
});

/**
 * POST /api/flutterwave/webhook
 * Handle Flutterwave webhook notifications
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['verif-hash'];
    
    if (!signature) {
      console.warn('[Flutterwave] Webhook received without signature');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Verify webhook signature
    const isValid = verifyWebhookSignature(signature, req.body);
    
    if (!isValid) {
      console.warn('[Flutterwave] Invalid webhook signature');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const payload = req.body;
    console.log('[Flutterwave] Webhook received:', payload.event, 'status:', payload.data?.status);

    // Handle successful charge
    if (payload.event === 'charge.completed' && payload.data) {
      const transaction = payload.data;
      
      if (transaction.status === 'successful') {
        // Find order by transaction reference
        const order = await CustomerOrder.findOne({
          'flutterwaveData.txRef': transaction.tx_ref,
        });

        if (order) {
          order.paymentStatus = 'paid';
          order.status = 'confirmed';
          order.flutterwaveData.transactionId = transaction.id;
          order.flutterwaveData.verifiedAt = new Date();
          await order.save();

          console.log(`[Flutterwave] Webhook: Payment confirmed for order ${order._id}`);
        } else {
          console.warn(`[Flutterwave] Webhook: Order not found for txRef ${transaction.tx_ref}`);
        }
      } else if (transaction.status === 'failed' || transaction.status === 'cancelled') {
        // Handle failed or cancelled payments
        const order = await CustomerOrder.findOne({
          'flutterwaveData.txRef': transaction.tx_ref,
        });

        if (order) {
          order.paymentStatus = 'failed';
          order.status = 'cancelled';
          await order.save();

          console.log(`[Flutterwave] Webhook: Payment ${transaction.status} for order ${order._id}`);
        }
      }
    }

    res.status(200).json({ message: 'Webhook received' });
  } catch (error) {
    console.error('[Flutterwave] Webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

module.exports = router;
