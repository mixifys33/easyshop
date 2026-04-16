const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const Product = require('../models/Product');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Free models in priority order — only ones confirmed to support system prompts
const FREE_MODELS = [
  process.env.OPENROUTER_MODEL,
  'openrouter/auto',
  'openrouter/polaris-alpha',
  'qwen/qwen3-235b-a22b:free',
  'mistralai/mistral-7b-instruct:free',
  'openrouter/free',
].filter(Boolean);

// Models that don't support system role
const NO_SYSTEM_MODELS = [
  'google/gemma-3-12b-it:free', 'google/gemma-3-4b-it:free', 'google/gemma-2-9b-it:free',
];

function prepareMessages(messages, model) {
  if (!NO_SYSTEM_MODELS.includes(model)) return messages;
  var system = messages.find(function(m) { return m.role === 'system'; });
  var rest = messages.filter(function(m) { return m.role !== 'system'; });
  if (!system) return rest;
  if (rest.length === 0) return [{ role: 'user', content: system.content }];
  return [{ role: 'user', content: system.content + '\n\n' + rest[0].content }].concat(rest.slice(1));
}

// Keywords that signal the user wants comparisons / alternatives
const COMPARISON_KEYWORDS = [
  'cheaper', 'less expensive', 'affordable', 'budget',
  'better', 'best', 'alternative', 'similar', 'compare', 'comparison',
  'other products', 'other options', 'something else', 'recommend',
  'suggestion', 'suggest', 'instead', 'upgrade', 'downgrade',
  'vs', 'versus', 'difference between', 'which is better', 'show me more',
];

const needsComparison = (messages) => {
  const lastUserMsg = [...messages].reverse().find(m => !m.isBot);
  if (!lastUserMsg) return false;
  const text = lastUserMsg.text.toLowerCase();
  return COMPARISON_KEYWORDS.some(kw => text.includes(kw));
};

// Fetch up to 6 related products from the same category (excluding current)
const getRelatedProducts = async (product) => {
  try {
    const query = {
      status: 'active',
      isDraft: { $ne: true },
    };
    if (product._id || product.id) {
      query._id = { $ne: product._id || product.id };
    }
    if (product.category) query.category = product.category;

    const related = await Product.find(query)
      .select('title regularPrice salePrice category subCategory brand stock description cashOnDelivery images')
      .populate('sellerId', 'shopName verified')
      .sort({ salePrice: 1 })
      .limit(6)
      .lean();

    return related;
  } catch (err) {
    console.error('Warning: Failed to fetch related products:', err.message);
    return [];
  }
};

const formatRelatedProducts = (products) => {
  if (!products.length) return '';
  return products.map((p, i) => {
    const price = p.salePrice
      ? `UGX ${Number(p.salePrice).toLocaleString()}`
      : `UGX ${Number(p.regularPrice).toLocaleString()}`;
    const shop = p.sellerId?.shopName || 'EasyShop';
    const verified = p.sellerId?.verified ? ' (Verified)' : '';
    const desc = p.description ? p.description.slice(0, 100) : '';
    return `${i + 1}. ${p.title} — ${price} | Brand: ${p.brand || 'N/A'} | Stock: ${p.stock > 0 ? p.stock + ' units' : 'Out of stock'} | Shop: ${shop}${verified}\n   ${desc}`;
  }).join('\n\n');
};

// Build the system prompt with full product context
const buildSystemPrompt = (product, relatedProducts = []) => {
  const price = product.price ? `UGX ${Number(product.price).toLocaleString()}` : 'N/A';
  const originalPrice = product.originalPrice ? `UGX ${Number(product.originalPrice).toLocaleString()}` : null;
  const discount = originalPrice
    ? `${Math.round((1 - product.price / product.originalPrice) * 100)}% off from ${originalPrice}`
    : null;

  const relatedSection = relatedProducts.length > 0
    ? `\nOTHER AVAILABLE PRODUCTS IN THE SAME CATEGORY (real data from our store):\n${formatRelatedProducts(relatedProducts)}\n\nWhen the customer asks for comparisons, alternatives, cheaper or better options — use ONLY the products listed above. Never invent or mention products not listed here.\n`
    : '';

  return `You are a helpful AI shopping assistant for EasyShop called ADO-( Advanced Developtilasied Optimatic AI after your creator Masereka Adorable Kimulya), an e-commerce store in Uganda. You NEVER answer in table format, When data needs to be structured, organized, or compared, DO NOT use rows and columns but Instead, use a nested bulleted list, bold text for headers, and paragraphs and Ensure all information is presented as clean text or markdown bullet points only.
Do not recommend other stores or platforms. If the user needs something not shown, direct them to use the search bar on the home screen.

CURRENT PRODUCT:
- Name: ${product.name || product.title || 'Unknown'}
- Price: ${price}${discount ? ` (${discount})` : ''}
- Category: ${product.category || 'N/A'}
- Sub-category: ${product.subCategory || 'N/A'}
- Brand: ${product.brand || 'N/A'}
- Stock: ${product.stock > 0 ? `${product.stock} units available` : 'Out of stock'}
- Description: ${product.description || 'No description available'}
- Seller/Shop: ${product.seller?.name || 'EasyShop Store'}
- Seller Verified: ${product.seller?.verified ? 'Yes' : 'No'}
- Cash on Delivery: ${product.cashOnDelivery || 'Available'}
- Currency: UGX (Ugandan Shillings)
${relatedSection}
YOUR ROLE:
- Answer questions about this product honestly and helpfully
- Help the customer decide if this product suits their needs
- Explain technical specs in simple, clear language
- Compare with real alternatives from the store when asked
- Be concise — short and direct unless detail is needed
- Never make up specs, prices, or products not listed above
- Always be friendly and supportive

The customer does NOT need to re-explain what product they are viewing.`;
};

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { messages, product } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    if (!product) {
      return res.status(400).json({ success: false, message: 'Product context is required' });
    }

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    // Fetch related products if the user is asking for comparisons/alternatives
    let relatedProducts = [];
    if (needsComparison(messages)) {
      console.log('🔍 Comparison query detected — fetching related products from DB...');
      relatedProducts = await getRelatedProducts(product);
      console.log(`� Found ${relatedProducts.length} related products`);
    }

    const systemPrompt = buildSystemPrompt(product, relatedProducts);

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.isBot ? 'assistant' : 'user',
        content: m.text,
      })),
    ];

    console.log(`🤖 AI Chat — product: ${product.name || product.title} | messages: ${messages.length}`);

    let data = null;
    let lastError = null;

    for (const model of FREE_MODELS) {
      console.log(`🔑 Trying model: ${model}`);
      let response;
      try {
        response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://easyshop.com',
            'X-Title': 'EasyShop AI Assistant',
          },
          body: JSON.stringify({
            model,
            messages: prepareMessages(chatMessages, model),
            max_tokens: 900,
            temperature: 0.9,
          }),
        });
      } catch (fetchErr) {
        console.error(`Fetch failed for model ${model}:`, fetchErr.message);
        lastError = fetchErr.message;
        continue;
      }

      console.log(`📡 Response status for ${model}: ${response.status}`);
      const rawText = await response.text();

      if (response.status === 429 || response.status === 503 || response.status === 400 || response.status === 402 || response.status === 404) {
        console.warn(`Model ${model} returned ${response.status}, trying next...`);
        lastError = rawText;
        continue;
      }

      if (!response.ok) {
        console.error(`Error from model ${model}:`, response.status, rawText.substring(0, 200));
        lastError = rawText;
        continue;
      }

      try {
        data = JSON.parse(rawText);
        console.log(`✅ Got response from model: ${model}`);
        break;
      } catch (parseErr) {
        console.error(`Failed to parse response from ${model}:`, parseErr.message);
        lastError = rawText;
        continue;
      }
    }

    if (!data) {
      console.error('All models failed. Last error:', lastError?.substring(0, 300));
      return res.status(502).json({
        success: false,
        message: 'AI service temporarily unavailable. Please try again shortly.',
      });
    }

    const choice = data.choices?.[0];
    const aiReply = choice?.message?.content
      || choice?.message?.reasoning
      || choice?.message?.reasoning_details?.[0]?.text
      || null;

    if (!aiReply) {
      console.error('No content in AI response:', JSON.stringify(data));
      return res.status(502).json({ success: false, message: 'No response from AI', raw: data });
    }

    console.log(`✅ AI replied (${aiReply.length} chars)`);

    // Include related products in response so frontend can render comparison cards
    const responsePayload = { success: true, reply: aiReply.trim() };
    if (relatedProducts.length > 0) {
      responsePayload.relatedProducts = relatedProducts.map(p => ({
        _id: p._id,
        title: p.title,
        salePrice: p.salePrice,
        regularPrice: p.regularPrice,
        brand: p.brand,
        stock: p.stock,
        category: p.category,
        image: p.images?.[0]?.url || p.images?.[0]?.uri || null,
        shopName: p.sellerId?.shopName || 'AllOutGadgets',
        verified: p.sellerId?.verified || false,
      }));
    }
    res.json(responsePayload);

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ success: false, message: 'AI service error', error: error.message });
  }
});

module.exports = router;
