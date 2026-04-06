const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Campaign = require('../models/Campaign');
const DeliveryTerminal = require('../models/DeliveryTerminal');
const Seller = require('../models/Seller');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ── Inline CustomerOrder model ────────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  userId: String, sellerId: String,
  items: [{ productId: String, name: String, price: Number, quantity: Number, image: String }],
  delivery: { type: { type: String }, name: String, fee: Number, estimatedDays: String },
  paymentMethod: String,
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  subtotal: Number, deliveryFee: Number,
  customerInfo: { fullName: String, phone: String, address: String, city: String, notes: String },
  buyerInfo: { userId: String, name: String, email: String, phone: String },
  proofImages: [{ url: String, fileId: String, uploadedAt: Date }],
  refundDetails: { method: String, reference: String, notes: String, refundNumber: String, completedAt: Date },
}, { timestamps: true });

const CustomerOrder = mongoose.models.CustomerOrder || mongoose.model('CustomerOrder', orderSchema);

// ── Model fallback chains ─────────────────────────────────────────────────────
const MODELS = [
  'openrouter/auto', 'openrouter/polaris-alpha',
  'qwen/qwen3.6-plus:free', 'google/gemma-3-12b-it:free', 'openrouter/free',
].filter(Boolean);

const VISION_MODELS = [
  'openrouter/auto', 'nvidia/nemotron-nano-12b-v2-vl:free', 'google/gemma-3-12b-it:free',
].filter(Boolean);

// ── Safe field selectors — no passwords, tokens, payment credentials ──────────
const PRODUCT_SELECT = 'title regularPrice salePrice category subCategory brand stock description cashOnDelivery images sellerId warranty tags colors sizes customSpecs deliveryFee freeDelivery featured';
const SELLER_PUBLIC_SELECT = 'shop.shopName shop.shopDescription shop.businessType shop.city shop.isSetup verified metrics delivery.offersDelivery delivery.offersPickup delivery.freeDeliveryThreshold delivery.processingDays delivery.zones delivery.notes';

// ── Call AI with model fallback ───────────────────────────────────────────────
async function callAI(messages, models, maxTokens) {
  maxTokens = maxTokens || 600;
  var lastError = null;
  for (var i = 0; i < models.length; i++) {
    try {
      var res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + OPENROUTER_API_KEY,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://easyshop.com',
          'X-Title': 'EasyShop AI',
        },
        body: JSON.stringify({ model: models[i], messages: messages, max_tokens: maxTokens, temperature: 0.25 }),
      });
      var raw = await res.text();
      if (res.status === 429 || res.status === 503) { lastError = raw; continue; }
      if (!res.ok) { lastError = raw; continue; }
      var data = JSON.parse(raw);
      var text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (text) return text.trim();
    } catch (e) { lastError = e.message; }
  }
  throw new Error('All AI models failed: ' + String(lastError).slice(0, 200));
}

// ── IMPROVEMENT 1+2: Smarter product search with relevance scoring + price filters ──
function parsePriceFilter(text) {
  // Normalise: remove spaces between digits so "100 000" and "100,000" both parse
  var normalised = text.replace(/(\d)[\s,](\d)/g, '$1$2');
  var under = normalised.match(/(?:under|below|less than|max|maximum|at most|up to)\s*(?:ugx\s*)?(\d+)/i);
  var over  = normalised.match(/(?:above|over|more than|min|minimum|at least|from)\s*(?:ugx\s*)?(\d+)/i);
  var budget = /\b(cheap|cheapest|affordable|budget|low.?price|inexpensive)\b/i.test(text);
  return {
    maxPrice: under ? parseInt(under[1]) : null,
    minPrice: over  ? parseInt(over[1])  : null,
    sortCheapest: budget || !!under,
  };
}

async function fetchProducts(query, limit, priceFilter) {
  limit = limit || 6;
  var base = { status: 'active', isDraft: { $ne: true } };

  // Apply price filter to DB query directly
  if (priceFilter && (priceFilter.maxPrice || priceFilter.minPrice)) {
    var priceQ = {};
    if (priceFilter.maxPrice) priceQ.$lte = priceFilter.maxPrice;
    if (priceFilter.minPrice) priceQ.$gte = priceFilter.minPrice;
    base.salePrice = priceQ;
  }

  var sortOrder = (priceFilter && priceFilter.sortCheapest)
    ? { salePrice: 1 }
    : { stock: -1, createdAt: -1 };

  if (!query || !query.trim()) {
    return Product.find(Object.assign({}, base, { stock: { $gt: 0 } }))
      .select(PRODUCT_SELECT).populate('sellerId', SELLER_PUBLIC_SELECT)
      .sort(sortOrder).limit(limit).lean();
  }

  var q = query.trim();

  // Title-exact matches first (highest relevance)
  var exact = await Product.find(Object.assign({}, base, { title: { $regex: q, $options: 'i' } }))
    .select(PRODUCT_SELECT).populate('sellerId', SELLER_PUBLIC_SELECT)
    .sort(sortOrder).limit(Math.ceil(limit / 2)).lean();

  // Broad search across all fields
  var broad = await Product.find(Object.assign({}, base, {
    $or: [
      { title: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
      { brand: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { tags: { $regex: q, $options: 'i' } },
      { subCategory: { $regex: q, $options: 'i' } },
    ],
  })).select(PRODUCT_SELECT).populate('sellerId', SELLER_PUBLIC_SELECT)
    .sort(sortOrder).limit(limit).lean();

  // Deduplicate, exact matches first
  var seen = {}, merged = [];
  exact.concat(broad).forEach(function(p) {
    var id = p._id.toString();
    if (!seen[id]) { seen[id] = true; merged.push(p); }
  });
  return merged.slice(0, limit);
}

// ── IMPROVEMENT 5: Order ID lookup ───────────────────────────────────────────
function extractOrderId(text) {
  // Match patterns like #ABC123, order ABC123, order id ABC123
  var m = text.match(/(?:#|order\s*(?:id|#|number)?\s*)([a-f0-9]{6,24})/i);
  return m ? m[1] : null;
}

async function fetchUserOrders(userId) {
  if (!userId) return [];
  return CustomerOrder.find({ userId: userId }).sort({ createdAt: -1 }).limit(15).lean();
}

async function fetchOrderById(orderId, userId) {
  if (!orderId) return null;
  try {
    // Try short ID match (last 6 chars) or full ObjectId
    var order = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await CustomerOrder.findById(orderId).lean();
    }
    if (!order) {
      // Search by short ID suffix — only return if it belongs to this user
      var orders = await CustomerOrder.find({ userId: userId }).sort({ createdAt: -1 }).limit(50).lean();
      order = orders.find(function(o) {
        return o._id.toString().slice(-6).toUpperCase() === orderId.toUpperCase();
      }) || null;
    }
    // Security: only return if it belongs to the requesting user
    if (order && userId && order.userId !== userId) return null;
    return order;
  } catch (_) { return null; }
}

async function fetchActiveCampaigns() {
  var now = new Date();
  return Campaign.find({ status: 'active', startDate: { $lte: now }, endDate: { $gte: now } })
    .select('title description type discountType discountValue couponCode minOrderAmount appliesTo categories productIds startDate endDate')
    .sort({ createdAt: -1 }).limit(10).lean();
}

async function fetchCategories() {
  return Product.distinct('category', { status: 'active', isDraft: { $ne: true } });
}

async function fetchDeliveryTerminals() {
  return DeliveryTerminal.find({ active: true })
    .select('name company region district city address phone type')
    .sort({ region: 1, city: 1 }).lean();
}

// ── Format helpers ────────────────────────────────────────────────────────────
function getShopName(sellerId) {
  if (!sellerId) return 'EasyShop';
  if (typeof sellerId === 'object') {
    return (sellerId.shop && sellerId.shop.shopName) || sellerId.shopName || 'EasyShop';
  }
  return 'EasyShop';
}

function formatProductForAI(p) {
  var price = p.salePrice || p.regularPrice || 0;
  var shop = getShopName(p.sellerId);
  var discount = (p.regularPrice && p.salePrice && p.salePrice < p.regularPrice)
    ? ' [' + Math.round((1 - p.salePrice / p.regularPrice) * 100) + '% OFF from UGX ' + Number(p.regularPrice).toLocaleString() + ']' : '';
  var specs = (p.customSpecs || []).map(function(s) { return s.name + ': ' + s.value; }).join(', ');
  return '"' + (p.title || '') + '"'
    + ' | UGX ' + Number(price).toLocaleString() + discount
    + ' | Stock: ' + (p.stock > 0 ? p.stock + ' units' : 'OUT OF STOCK')
    + ' | Brand: ' + (p.brand || 'N/A')
    + ' | Category: ' + (p.category || '') + (p.subCategory ? ' > ' + p.subCategory : '')
    + ' | Shop: ' + shop
    + (p.cashOnDelivery === 'Yes' ? ' | COD: Yes' : '')
    + (p.freeDelivery ? ' | Free Delivery' : p.deliveryFee ? ' | Delivery: UGX ' + Number(p.deliveryFee).toLocaleString() : '')
    + (p.warranty ? ' | Warranty: ' + p.warranty : '')
    + (specs ? ' | Specs: ' + specs : '')
    + (p.colors && p.colors.length ? ' | Colors: ' + p.colors.join(', ') : '')
    + (p.sizes && p.sizes.length ? ' | Sizes: ' + p.sizes.join(', ') : '');
}

function formatProductCard(p) {
  var price = p.salePrice || p.regularPrice || 0;
  var img = (p.images && p.images[0] && (p.images[0].url || p.images[0].thumbnailUrl)) || '';
  return {
    id: p._id ? p._id.toString() : '',
    name: p.title || '',
    price: price,
    originalPrice: (p.regularPrice && p.salePrice && p.salePrice < p.regularPrice) ? p.regularPrice : null,
    priceFormatted: 'UGX ' + Number(price).toLocaleString(),
    category: p.category || '',
    subCategory: p.subCategory || '',
    brand: p.brand || '',
    stock: p.stock || 0,
    description: (p.description || '').slice(0, 150),
    image: img,
    shopName: getShopName(p.sellerId),
    cashOnDelivery: p.cashOnDelivery || 'No',
    sellerId: p.sellerId ? (p.sellerId._id || p.sellerId).toString() : '',
    warranty: p.warranty || '',
    colors: p.colors || [],
    sizes: p.sizes || [],
    freeDelivery: p.freeDelivery || false,
    deliveryFee: p.deliveryFee || 0,
    featured: p.featured || false,
  };
}

function formatOrderForAI(o) {
  var items = (o.items || []).map(function(i) {
    return i.name + ' x' + i.quantity + ' @ UGX ' + Number(i.price || 0).toLocaleString();
  }).join(', ');
  var total = o.subtotal ? 'UGX ' + Number(o.subtotal).toLocaleString() : 'N/A';
  var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
  var delivery = o.delivery && o.delivery.name
    ? o.delivery.name + (o.delivery.estimatedDays ? ' (' + o.delivery.estimatedDays + ' days)' : '')
    : 'Not set';
  return 'Order #' + o._id.toString().slice(-6).toUpperCase()
    + ' | Status: ' + (o.status || 'pending').toUpperCase()
    + ' | Payment: ' + (o.paymentStatus || 'pending') + ' via ' + (o.paymentMethod || 'N/A')
    + ' | Items: ' + (items || 'N/A')
    + ' | Total: ' + total + (o.deliveryFee ? ' + UGX ' + Number(o.deliveryFee).toLocaleString() + ' delivery' : '')
    + ' | Delivery: ' + delivery
    + ' | Date: ' + date;
}

function formatOrderCard(o) {
  return {
    id: o._id.toString(),
    shortId: o._id.toString().slice(-6).toUpperCase(),
    status: o.status || 'pending',
    paymentStatus: o.paymentStatus || 'pending',
    paymentMethod: o.paymentMethod || '',
    items: o.items || [],
    subtotal: o.subtotal || 0,
    deliveryFee: o.deliveryFee || 0,
    delivery: o.delivery || null,
    customerInfo: o.customerInfo ? { fullName: o.customerInfo.fullName, city: o.customerInfo.city } : null,
    createdAt: o.createdAt,
  };
}

// ── IMPROVEMENT 4: Campaign-to-product linking ────────────────────────────────
async function formatCampaignForAI(c) {
  var discount = c.discountType === 'percentage'
    ? c.discountValue + '% off'
    : 'UGX ' + Number(c.discountValue).toLocaleString() + ' off';
  var end = c.endDate ? new Date(c.endDate).toLocaleDateString('en-UG', { day: 'numeric', month: 'short' }) : '?';

  var appliesInfo = '';
  if (c.appliesTo === 'specific_products' && c.productIds && c.productIds.length) {
    var products = await Product.find({ _id: { $in: c.productIds }, status: 'active' })
      .select('title salePrice').limit(5).lean();
    if (products.length) {
      appliesInfo = ' | Applies to: ' + products.map(function(p) { return p.title; }).join(', ');
    }
  } else if (c.appliesTo === 'specific_categories' && c.categories && c.categories.length) {
    appliesInfo = ' | Applies to categories: ' + c.categories.join(', ');
  }

  return '"' + c.title + '"'
    + ' | Type: ' + c.type.replace(/_/g, ' ')
    + ' | Discount: ' + discount
    + (c.couponCode ? ' | Coupon code: ' + c.couponCode : '')
    + (c.minOrderAmount ? ' | Min order: UGX ' + Number(c.minOrderAmount).toLocaleString() : '')
    + ' | Ends: ' + end
    + appliesInfo;
}

function formatSellerForAI(s) {
  if (!s) return null;
  var shop = s.shop || {};
  var delivery = s.delivery || {};
  var zones = (delivery.zones || []).filter(function(z) { return z.active; })
    .map(function(z) { return z.name + ' (UGX ' + Number(z.fee || 0).toLocaleString() + ', ' + (z.estimatedDays || '?') + ' days)'; }).join(', ');
  return 'Shop: ' + (shop.shopName || 'N/A')
    + ' | Type: ' + (shop.businessType || 'N/A')
    + ' | City: ' + (shop.city || 'N/A')
    + ' | Verified: ' + (s.verified ? 'Yes' : 'No')
    + ' | Rating: ' + (s.metrics && s.metrics.rating ? s.metrics.rating + '/5 (' + s.metrics.reviewCount + ' reviews)' : 'N/A')
    + ' | Home delivery: ' + (delivery.offersDelivery ? 'Yes' : 'No')
    + ' | Pickup: ' + (delivery.offersPickup ? 'Yes' : 'No')
    + (delivery.freeDeliveryThreshold ? ' | Free delivery from: UGX ' + Number(delivery.freeDeliveryThreshold).toLocaleString() : '')
    + (zones ? ' | Delivery zones: ' + zones : '')
    + (delivery.notes ? ' | Notes: ' + delivery.notes : '');
}

// ── Topic detection — scans full conversation, never loses context ─────────────
function detectTopics(messages) {
  var allText = messages.map(function(m) { return (m.content || '').toLowerCase(); }).join(' ');
  var lastUser = '';
  for (var i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { lastUser = (messages[i].content || '').toLowerCase(); break; }
  }
  return {
    wantsOrders:    /\b(order|orders|my order|track|tracking|status|delivery status|where is|shipped|delivered|cancelled|refund|payment status|purchase|bought|placed|receipt)\b/.test(allText),
    wantsProducts:  /\b(product|products|find|search|show|looking for|buy|price|cost|available|stock|brand|category|electronics|fashion|phone|laptop|shoes|clothes|cheap|affordable|best|recommend|similar|compare|alternative|item|items|sell|selling|have you got|do you have)\b/.test(allText),
    wantsCampaigns: /\b(deal|deals|offer|offers|discount|sale|promo|promotion|coupon|code|campaign|flash sale|bundle|voucher|savings)\b/.test(allText),
    wantsCategories:/\b(categor|categories|types|kinds|what do you sell|what products|browse|department|section)\b/.test(allText),
    wantsDelivery:  /\b(deliver|delivery|shipping|ship|terminal|bus|pickup|location|where|how long|days|fee|cost of delivery|link bus|collect|collection point)\b/.test(allText),
    wantsSeller:    /\b(seller|shop|store|vendor|who sells|shop info|about the shop|verified|merchant)\b/.test(allText),
    // IMPROVEMENT 5: order ID lookup
    specificOrderId: extractOrderId(lastUser),
    lastUserText: lastUser,
    allText: allText,
  };
}

function extractSearchQuery(lastUserText) {
  return lastUserText
    .replace(/show me|find me|i want|i need|looking for|do you have|search for|can you find|what about|tell me about|give me|get me|display|list/gi, '')
    .replace(/\b(products?|items?|things?|stuff)\b/gi, '')
    .replace(/\b(please|thanks|thank you|okay|ok)\b/gi, '')
    .replace(/\b(under|below|above|over|less than|more than|max|min|cheapest|affordable|budget)\s*(?:ugx\s*)?\d[\d,]*/gi, '')
    .trim()
    .slice(0, 100);
}

// ── IMPROVEMENT 6: Suggested follow-up chips based on context ─────────────────
function buildSuggestions(topics, hasProducts, hasOrders) {
  var chips = [];
  if (hasProducts) {
    chips.push('Show cheapest first');
    chips.push('Which has free delivery?');
    chips.push('Compare these products');
  }
  if (hasOrders) {
    chips.push('What does this status mean?');
    chips.push('How do I cancel an order?');
  }
  if (topics.wantsDelivery) {
    chips.push('What are the delivery fees?');
  }
  if (!hasProducts && !hasOrders) {
    chips.push('Show me best products');
    chips.push('What deals are on?');
    chips.push('Show my orders');
  }
  return chips.slice(0, 4);
}

// ── Build full DB context ─────────────────────────────────────────────────────
async function buildSystemContext(messages, userId) {
  var topics = detectTopics(messages);
  var contextParts = [];
  var productCards = [];
  var orderCards = [];

  // Always load categories + campaigns in parallel
  var [categories, campaigns] = await Promise.all([
    fetchCategories().catch(function() { return []; }),
    fetchActiveCampaigns().catch(function() { return []; }),
  ]);

  contextParts.push('AVAILABLE CATEGORIES: ' + (categories.length
    ? categories.join(', ')
    : 'Electronics, Fashion, Home & Garden, Health & Beauty, Sports & Outdoors, Automotive, Food & Beverages'));

  // IMPROVEMENT 4: campaigns with linked products
  if (campaigns.length) {
    var campaignLines = await Promise.all(campaigns.map(formatCampaignForAI));
    contextParts.push('\nACTIVE DEALS & CAMPAIGNS ON EASYSHOP UGANDA RIGHT NOW:\n' + campaignLines.join('\n'));
  } else {
    contextParts.push('\nACTIVE DEALS & CAMPAIGNS: None currently active on EasyShop Uganda.');
  }

  // IMPROVEMENT 1+2: products with price-aware search
  if (topics.wantsProducts || topics.wantsSeller) {
    var priceFilter = parsePriceFilter(topics.lastUserText);
    var query = extractSearchQuery(topics.lastUserText);
    var rawProducts = await fetchProducts(query, 8, priceFilter).catch(function() { return []; });

    if (!rawProducts.length && query) {
      rawProducts = await fetchProducts('', 6, priceFilter).catch(function() { return []; });
    }

    if (rawProducts.length) {
      contextParts.push('\nMATCHING PRODUCTS FROM DATABASE:\n' + rawProducts.map(formatProductForAI).join('\n'));
      productCards = rawProducts.map(formatProductCard);
    } else {
      contextParts.push('\nPRODUCTS: No products found matching this query in the database.');
    }

    // IMPROVEMENT 3: seller delivery context for first product's seller
    if (rawProducts.length && rawProducts[0].sellerId) {
      var sellerId = rawProducts[0].sellerId._id || rawProducts[0].sellerId;
      var sellerDoc = await Seller.findById(sellerId).select(SELLER_PUBLIC_SELECT).lean().catch(function() { return null; });
      if (sellerDoc) {
        contextParts.push('\nSELLER INFO FOR TOP RESULT:\n' + formatSellerForAI(sellerDoc));
      }
    }
  }

  // IMPROVEMENT 5: specific order ID lookup
  if (topics.specificOrderId && userId) {
    var specificOrder = await fetchOrderById(topics.specificOrderId, userId).catch(function() { return null; });
    if (specificOrder) {
      contextParts.push('\nSPECIFIC ORDER REQUESTED:\n' + formatOrderForAI(specificOrder));
      orderCards = [formatOrderCard(specificOrder)];
    }
  }

  // General order listing
  if (topics.wantsOrders && userId && !orderCards.length) {
    var orders = await fetchUserOrders(userId).catch(function() { return []; });
    if (orders.length) {
      contextParts.push('\nUSER\'S ORDERS (most recent first):\n' + orders.map(formatOrderForAI).join('\n'));
      orderCards = orders.map(formatOrderCard);
    } else {
      contextParts.push('\nUSER\'S ORDERS: No orders found for this user yet.');
    }
  } else if (topics.wantsOrders && !userId) {
    contextParts.push('\nUSER\'S ORDERS: User is not logged in — cannot fetch orders. Ask them to log in.');
  }

  // Delivery terminals
  if (topics.wantsDelivery) {
    var terminals = await fetchDeliveryTerminals().catch(function() { return []; });
    if (terminals.length) {
      var terminalText = terminals.map(function(t) {
        return t.name + ' | ' + t.city + ', ' + t.district + ' (' + t.region + ') | Tel: ' + (t.phone || 'N/A');
      }).join('\n');
      contextParts.push('\nDELIVERY TERMINALS (Link Bus Uganda):\n' + terminalText);
    }
  }

  var suggestions = buildSuggestions(topics, productCards.length > 0, orderCards.length > 0);

  return { contextParts: contextParts, productCards: productCards, orderCards: orderCards, suggestions: suggestions };
}

// ── System prompt ─────────────────────────────────────────────────────────────
var BASE_SYSTEM_PROMPT = `You are EasyShop AI — the built-in shopping assistant for EasyShop Uganda.
You ONLY know about EasyShop Uganda. You have ZERO knowledge of any other store, retailer, or platform.

CRITICAL RULES — NEVER BREAK THESE:
1. ONLY use data from the DATABASE section below. If something is not listed there, it does not exist.
2. NEVER mention any external store, brand, or platform (no Amazon, Walmart, Jumia, etc.).
3. NEVER invent products, prices, deals, or order details. Only use what is in the data.
4. Cards appear automatically — do NOT list products or orders in text.
5. If user asks about orders and is not logged in, tell them to log in first.
6. Prices are in UGX (Ugandan Shillings).
7. Never mention passwords, payment account numbers, tokens, or any credentials.
8. Handle ALL topics naturally in one conversation — products, orders, deals, delivery, categories.
9. When showing products, mention key facts (price, stock, COD availability) briefly.
10. For order status questions, explain what the status means in plain language.`;

// ── POST /api/shop-ai/chat ────────────────────────────────────────────────────
router.post('/chat', async function(req, res) {
  try {
    var messages = req.body.messages || [];
    var userContext = req.body.userContext || {};

    if (!messages.length) return res.status(400).json({ error: 'messages required' });
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    var userId = userContext.userId || null;

    var dbContext = await buildSystemContext(messages, userId);

    var systemPrompt = BASE_SYSTEM_PROMPT
      + '\n\n=== LIVE DATA FROM EASYSHOP UGANDA DATABASE (USE ONLY THIS) ===\n'
      + dbContext.contextParts.join('\n')
      + '\n=== END OF DATABASE DATA — DO NOT USE ANY OTHER SOURCE ===';

    var cleanHistory = messages.filter(function(m) {
      return m.role && m.content && !m.loading;
    }).slice(-14);

    var aiMessages = [{ role: 'system', content: systemPrompt }].concat(cleanHistory);

    console.log('[shopAI] userId:', userId, '| msgs:', cleanHistory.length,
      '| products:', dbContext.productCards.length, '| orders:', dbContext.orderCards.length);

    var reply = await callAI(aiMessages, MODELS, 500);

    res.json({
      success: true,
      reply: reply,
      products: dbContext.productCards,
      orders: dbContext.orderCards,
      suggestions: dbContext.suggestions,
    });
  } catch (e) {
    console.error('[shopAI] chat error:', e.message);
    res.status(500).json({ error: 'AI service error', detail: e.message });
  }
});

// ── POST /api/shop-ai/image-search ───────────────────────────────────────────
router.post('/image-search', async function(req, res) {
  try {
    var imageUrl = req.body.imageUrl;
    var imageBase64 = req.body.imageBase64;

    if (!imageUrl && !imageBase64) return res.status(400).json({ error: 'imageUrl or imageBase64 required' });
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    var imageContent = imageUrl
      ? { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
      : { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageBase64, detail: 'high' } };

    var identifyRaw = await callAI([{
      role: 'user',
      content: [
        imageContent,
        { type: 'text', text: 'Identify the product in this image. Respond ONLY with JSON: {"productName":"name","category":"category","brand":"brand or empty","keywords":["kw1","kw2","kw3"]}' },
      ],
    }], VISION_MODELS, 300);

    var identified = { productName: 'product', keywords: [] };
    try {
      var m = identifyRaw.match(/\{[\s\S]*\}/);
      identified = JSON.parse(m ? m[0] : identifyRaw);
    } catch (_) {}

    console.log('[shopAI] Image identified:', identified);

    var query = [identified.brand, identified.productName].concat(identified.keywords || []).filter(Boolean).join(' ');
    var rawProducts = await fetchProducts(query, 6);
    if (!rawProducts.length) rawProducts = await fetchProducts(identified.category || identified.productName || '', 6);

    var productContext = rawProducts.length
      ? rawProducts.map(formatProductForAI).join('\n')
      : '(no matching products found in EasyShop Uganda database)';

    var systemPrompt = 'You are EasyShop AI. The user uploaded an image.\n'
      + 'Identified: ' + (identified.productName || 'unknown') + ' | Brand: ' + (identified.brand || 'unknown') + '\n\n'
      + 'MATCHING PRODUCTS IN EASYSHOP UGANDA:\n' + productContext + '\n\n'
      + 'ONLY reference products listed above. Never mention other stores.';

    var reply = await callAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'I uploaded an image to find this product.' },
    ], MODELS, 200);

    res.json({
      success: true,
      identified: identified,
      products: rawProducts.map(formatProductCard),
      orders: [],
      reply: reply,
      suggestions: ['Show similar products', 'What is the price?', 'Add to cart'],
    });
  } catch (e) {
    console.error('[shopAI] image-search error:', e.message);
    res.status(500).json({ error: 'Image search failed', detail: e.message });
  }
});

// ── GET /api/shop-ai/recommendations ─────────────────────────────────────────
router.get('/recommendations', async function(req, res) {
  try {
    var category = req.query.category || '';
    var limit = parseInt(req.query.limit) || 8;
    var rawProducts = await fetchProducts(category, limit);
    res.json({ success: true, products: rawProducts.map(formatProductCard) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

module.exports = router;
