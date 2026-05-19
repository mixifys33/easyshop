/**
 * Permanently delete a seller and all related data (MongoDB + ImageKit).
 */
const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const Application = require('../models/Application');
const Product = require('../models/Product');
const Campaign = require('../models/Campaign');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const PushToken = require('../models/PushToken');

function getCustomerOrderModel() {
  if (mongoose.models.CustomerOrder) {
    return mongoose.models.CustomerOrder;
  }
  const orderSchema = new mongoose.Schema(
    {
      userId: String,
      sellerId: String,
      items: Array,
      proofImages: Array,
      refundDetails: Object,
    },
    { strict: false, timestamps: true }
  );
  return mongoose.model('CustomerOrder', orderSchema);
}

function collectFileIds(value, ids = new Set()) {
  if (value == null) return ids;

  if (Array.isArray(value)) {
    value.forEach((item) => collectFileIds(item, ids));
    return ids;
  }

  if (typeof value === 'object') {
    if (typeof value.fileId === 'string' && value.fileId.trim()) {
      ids.add(value.fileId.trim());
    }
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'password' || key === '__v') continue;
      collectFileIds(nested, ids);
    }
  }

  return ids;
}

function getImageKitClient() {
  try {
    const ImageKit = require('@imagekit/nodejs');
    if (
      !process.env.IMAGEKIT_PUBLIC_KEY ||
      !process.env.IMAGEKIT_PRIVATE_KEY ||
      !process.env.IMAGEKIT_URL_ENDPOINT
    ) {
      return null;
    }
    return new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });
  } catch (err) {
    console.error('[SellerDeletion] ImageKit init failed:', err.message);
    return null;
  }
}

async function deleteImageKitFiles(fileIds) {
  const imagekit = getImageKitClient();
  if (!imagekit || typeof imagekit.files?.delete !== 'function') {
    return { deleted: 0, errors: [{ error: 'ImageKit not configured' }] };
  }

  const errors = [];
  let deleted = 0;

  for (const fileId of fileIds) {
    try {
      await imagekit.files.delete(fileId);
      deleted += 1;
    } catch (err) {
      console.error(`[SellerDeletion] ImageKit delete failed for ${fileId}:`, err.message);
      errors.push({ fileId, error: err.message });
    }
  }

  return { deleted, errors };
}

function buildOrderDeleteFilter(sellerId, applicationIds, productIds) {
  const sid = sellerId.toString();
  const or = [{ sellerId: sid }, { sellerId: sellerId }];

  if (applicationIds.length) {
    or.push({ 'items.productId': { $in: applicationIds } });
    or.push({ 'items.applicationId': { $in: applicationIds } });
  }
  if (productIds.length) {
    or.push({ 'items.productId': { $in: productIds } });
  }

  return { $or: or };
}

/**
 * @param {string} sellerId
 * @returns {Promise<{ found: boolean, counts?: object, imageDeletionErrors?: array }>}
 */
async function permanentlyDeleteSeller(sellerId) {
  if (!mongoose.Types.ObjectId.isValid(sellerId)) {
    return { found: false };
  }

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return { found: false };
  }

  const fileIds = collectFileIds(seller.toObject());
  const CustomerOrder = getCustomerOrderModel();

  const [applications, products, campaigns] = await Promise.all([
    Application.find({ sellerId: seller._id }).lean(),
    Product.find({ sellerId: seller._id }).lean(),
    Campaign.find({ sellerId: seller._id }).lean(),
  ]);

  const applicationIds = applications.map((a) => a._id.toString());
  const productIds = products.map((p) => p._id.toString());

  applications.forEach((app) => collectFileIds(app, fileIds));
  products.forEach((product) => collectFileIds(product, fileIds));

  const orderFilter = buildOrderDeleteFilter(seller._id, applicationIds, productIds);
  const orders = await CustomerOrder.find(orderFilter).lean();
  orders.forEach((order) => collectFileIds(order, fileIds));

  const conversations = await Conversation.find({
    participants: {
      $elemMatch: { user: seller._id, userType: 'Seller' },
    },
  }).select('_id');
  const conversationIds = conversations.map((c) => c._id);

  const imageResult = await deleteImageKitFiles(fileIds);

  const productObjectIds = products.map((p) => p._id);
  const reviewDelete =
    mongoose.models.Review && productObjectIds.length
      ? mongoose.models.Review.deleteMany({ productId: { $in: productObjectIds } })
      : Promise.resolve({ deletedCount: 0 });

  const legacyOrderDelete = productObjectIds.length
    ? require('../models/Order')
        .deleteMany({ 'items.product': { $in: productObjectIds } })
        .catch(() => ({ deletedCount: 0 }))
    : Promise.resolve({ deletedCount: 0 });

  const [
    messagesResult,
    conversationsResult,
    ordersResult,
    legacyOrdersResult,
    reviewsResult,
    campaignsResult,
    productsResult,
    applicationsResult,
    pushTokensResult,
  ] = await Promise.all([
    conversationIds.length
      ? Message.deleteMany({ conversation: { $in: conversationIds } })
      : { deletedCount: 0 },
    conversationIds.length
      ? Conversation.deleteMany({ _id: { $in: conversationIds } })
      : { deletedCount: 0 },
    CustomerOrder.deleteMany(orderFilter),
    legacyOrderDelete,
    reviewDelete,
    Campaign.deleteMany({ sellerId: seller._id }),
    Product.deleteMany({ sellerId: seller._id }),
    Application.deleteMany({ sellerId: seller._id }),
    PushToken.deleteMany({ userId: seller._id }),
  ]);

  await Seller.findByIdAndDelete(seller._id);

  return {
    found: true,
    counts: {
      applications: applicationsResult.deletedCount,
      products: productsResult.deletedCount,
      campaigns: campaignsResult.deletedCount,
      orders: ordersResult.deletedCount,
      legacyOrders: legacyOrdersResult.deletedCount,
      reviews: reviewsResult.deletedCount,
      messages: messagesResult.deletedCount,
      conversations: conversationsResult.deletedCount,
      pushTokens: pushTokensResult.deletedCount,
      imageKitFiles: imageResult.deleted,
    },
    imageDeletionErrors: imageResult.errors.length ? imageResult.errors : undefined,
  };
}

module.exports = {
  permanentlyDeleteSeller,
  collectFileIds,
};
