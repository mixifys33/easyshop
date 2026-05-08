const Flutterwave = require('flutterwave-node-v3');
const axios = require('axios');

const flw = new Flutterwave(
  process.env.FLUTTERWAVE_PUBLIC_KEY,
  process.env.FLUTTERWAVE_SECRET_KEY,
  process.env.FLUTTERWAVE_ENCRYPTION_KEY
);

/**
 * Initialize a card payment using direct API call
 */
async function initializeCardPayment(paymentData) {
  try {
    const payload = {
      tx_ref: paymentData.txRef,
      amount: paymentData.amount,
      currency: paymentData.currency || 'UGX',
      redirect_url: paymentData.redirectUrl,
      payment_options: 'card',
      customer: {
        email: paymentData.customerEmail,
        phonenumber: paymentData.customerPhone,
        name: paymentData.customerName,
      },
      customizations: {
        title: 'VETTCODE Payment',
        description: paymentData.description || 'Payment for order',
        logo: 'https://vettcode.vercel.app/icon-192.png',
      },
      meta: {
        orderId: paymentData.orderId,
      },
    };

    // Use direct API call
    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return {
      success: true,
      data: response.data,
      paymentLink: response.data?.data?.link,
    };
  } catch (error) {
    console.error('Flutterwave card payment error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to initialize card payment',
    };
  }
}

/**
 * Initialize mobile money payment
 */
async function initializeMobileMoneyPayment(paymentData) {
  try {
    const payload = {
      tx_ref: paymentData.txRef,
      amount: paymentData.amount,
      currency: paymentData.currency || 'UGX',
      redirect_url: paymentData.redirectUrl,
      payment_options: 'mobilemoneyuganda',
      customer: {
        email: paymentData.customerEmail,
        phonenumber: paymentData.customerPhone,
        name: paymentData.customerName,
      },
      customizations: {
        title: 'VETTCODE Payment',
        description: paymentData.description || 'Payment for order',
        logo: 'https://vettcode.vercel.app/icon-192.png',
      },
      meta: {
        orderId: paymentData.orderId,
      },
    };

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return {
      success: true,
      data: response.data,
      paymentLink: response.data?.data?.link,
    };
  } catch (error) {
    console.error('Flutterwave mobile money error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to initialize mobile money payment',
    };
  }
}

/**
 * Initialize standard payment (shows all payment options)
 */
async function initializeStandardPayment(paymentData) {
  try {
    const payload = {
      tx_ref: paymentData.txRef,
      amount: paymentData.amount,
      currency: paymentData.currency || 'UGX',
      redirect_url: paymentData.redirectUrl,
      customer: {
        email: paymentData.customerEmail,
        phonenumber: paymentData.customerPhone,
        name: paymentData.customerName,
      },
      customizations: {
        title: 'VETTCODE Payment',
        description: paymentData.description || 'Payment for order',
        logo: 'https://vettcode.vercel.app/icon-192.png',
      },
      meta: {
        orderId: paymentData.orderId,
      },
    };

    const response = await axios.post(
      'https://api.flutterwave.com/v3/payments',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return {
      success: true,
      data: response.data,
      paymentLink: response.data?.data?.link,
    };
  } catch (error) {
    console.error('Flutterwave standard payment error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to initialize payment',
    };
  }
}

/**
 * Verify a transaction
 */
async function verifyTransaction(transactionId) {
  try {
    const response = await flw.Transaction.verify({ id: transactionId });
    
    if (response.status === 'success' && response.data) {
      const transaction = response.data;
      
      return {
        success: true,
        verified: transaction.status === 'successful',
        data: {
          transactionId: transaction.id,
          txRef: transaction.tx_ref,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          paymentType: transaction.payment_type,
          customer: {
            email: transaction.customer?.email,
            phone: transaction.customer?.phone_number,
            name: transaction.customer?.name,
          },
          meta: transaction.meta,
        },
      };
    }
    
    return {
      success: false,
      verified: false,
      message: 'Transaction verification failed',
    };
  } catch (error) {
    console.error('Flutterwave verification error:', error);
    return {
      success: false,
      verified: false,
      message: error.message || 'Failed to verify transaction',
    };
  }
}

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(signature, payload) {
  const crypto = require('crypto');
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  
  if (!secretHash) {
    console.error('FLUTTERWAVE_SECRET_HASH not configured');
    return false;
  }
  
  const hash = crypto
    .createHmac('sha256', secretHash)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return hash === signature;
}

/**
 * Get transaction by reference
 */
async function getTransactionByRef(txRef) {
  try {
    // Use direct API call to get transaction by reference
    const response = await axios.get(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${txRef}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );
    
    if (response.data?.status === 'success' && response.data?.data) {
      return {
        success: true,
        data: response.data.data,
      };
    }
    
    return {
      success: false,
      message: response.data?.message || 'Transaction not found',
    };
  } catch (error) {
    console.error('Flutterwave get transaction error:', error.response?.data || error.message);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to get transaction',
    };
  }
}

module.exports = {
  initializeCardPayment,
  initializeMobileMoneyPayment,
  initializeStandardPayment,
  verifyTransaction,
  verifyWebhookSignature,
  getTransactionByRef,
};
