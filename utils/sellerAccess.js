const Seller = require('../models/Seller');

/**
 * Block login (banned / suspended / rejected only).
 */
function getSellerLoginDenial(seller) {
  if (!seller) {
    return {
      statusCode: 404,
      body: { success: false, message: 'Invalid credentials', error: 'Email or password is incorrect' },
    };
  }

  if (seller.status === 'banned') {
    return {
      statusCode: 403,
      body: {
        success: false,
        code: 'SELLER_BANNED',
        message: 'Account banned',
        error:
          seller.banReason ||
          'Your seller account has been banned. Contact support if you believe this is a mistake.',
        status: seller.status,
      },
    };
  }

  if (seller.status === 'suspended') {
    return {
      statusCode: 403,
      body: {
        success: false,
        code: 'SELLER_SUSPENDED',
        message: 'Account suspended',
        error:
          seller.suspensionReason ||
          'Your seller account has been suspended. Contact support for assistance.',
        status: seller.status,
      },
    };
  }

  if (seller.approvalStatus === 'rejected') {
    return {
      statusCode: 403,
      body: {
        success: false,
        code: 'SELLER_REJECTED',
        message: 'Application rejected',
        error:
          seller.approvalRejectionReason ||
          'Your seller application was not approved.',
        approvalStatus: seller.approvalStatus,
      },
    };
  }

  return null;
}

/**
 * Block seller dashboard actions (includes pending / inactive).
 */
function getSellerOperationDenial(seller) {
  const loginDenial = getSellerLoginDenial(seller);
  if (loginDenial) return loginDenial;

  if (!seller) {
    return {
      statusCode: 404,
      body: { success: false, message: 'Seller not found', error: 'Seller not found' },
    };
  }

  if (seller.approvalStatus === 'pending_review') {
    return {
      statusCode: 403,
      body: {
        success: false,
        code: 'SELLER_PENDING_APPROVAL',
        message: 'Account pending approval',
        error: 'Your seller account is waiting for admin approval.',
        approvalStatus: seller.approvalStatus,
        status: seller.status,
      },
    };
  }

  if (seller.status !== 'active') {
    return {
      statusCode: 403,
      body: {
        success: false,
        code: 'SELLER_INACTIVE',
        message: 'Account not active',
        error: 'Your seller account is not active.',
        status: seller.status,
      },
    };
  }

  if (!seller.verified) {
    return {
      statusCode: 403,
      body: {
        success: false,
        code: 'SELLER_UNVERIFIED',
        message: 'Account not verified',
        error: 'Please verify your email address first.',
      },
    };
  }

  return null;
}

async function enforceSellerCanOperate(sellerId, res) {
  if (!sellerId) {
    res.status(400).json({ success: false, error: 'Seller ID is required' });
    return null;
  }

  const seller = await Seller.findById(sellerId);
  const denial = getSellerOperationDenial(seller);
  if (denial) {
    res.status(denial.statusCode).json(denial.body);
    return null;
  }

  return seller;
}

function sellerStatusPayload(seller) {
  return {
    id: seller._id,
    status: seller.status,
    approvalStatus: seller.approvalStatus,
    verified: seller.verified,
  };
}

module.exports = {
  getSellerLoginDenial,
  getSellerOperationDenial,
  enforceSellerCanOperate,
  sellerStatusPayload,
};
