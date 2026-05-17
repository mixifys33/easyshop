const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const Application = require('../models/Application');
const aiAuth = require('../middleware/aiAuth');
const {
  detectPromptInjection,
  sanitizeInput,
  validateMessages,
  filterResponse,
  checkRateLimit,
} = require('../services/aiSecurityService');
const {
  buildEnhancedSystemPrompt,
  isAppAccessible,
} = require('../services/aiContextBuilder');
const {
  detectUserIntent,
  selectApplicationFields,
  truncateFieldsForAI,
  rankAndFilterApplications,
} = require('../services/aiDataOptimizer');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Apply AI auth middleware to all routes
router.use(aiAuth);

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
  'cheaper', 'less expensive', 'affordable', 'budget', 'free',
  'better', 'best', 'alternative', 'similar', 'compare', 'comparison',
  'other applications', 'other apps', 'other options', 'something else', 'recommend',
  'suggestion', 'suggest', 'instead', 'upgrade', 'downgrade',
  'vs', 'versus', 'difference between', 'which is better', 'show me more',
];

const needsComparison = (messages) => {
  const lastUserMsg = [...messages].reverse().find(m => !m.isBot);
  if (!lastUserMsg) return false;
  const text = lastUserMsg.text.toLowerCase();
  return COMPARISON_KEYWORDS.some(kw => text.includes(kw));
};

// Fetch related applications intelligently based on intent
const getRelatedApplications = async (application, userMessages = []) => {
  try {
    // Detect user intent to determine how many results to fetch
    const { intent, limit } = detectUserIntent(userMessages);
    
    const query = {
      verificationStatus: 'verified',
      isActive: true,
      isDraft: { $ne: true },
    };
    
    if (application._id || application.id) {
      query._id = { $ne: application._id || application.id };
    }
    
    if (application.appCategory) {
      query.appCategory = application.appCategory;
    }

    // Fetch only essential fields to reduce memory usage
    const related = await Application.find(query)
      .select('appName price isFree currency appCategory rating downloads verificationStatus shortDescription technologyStack supportedPlatforms')
      .populate('sellerId', 'shopName verified')
      .sort({ downloads: -1, rating: -1 })
      .limit(limit) // Use intent-based limit instead of fixed 6
      .lean();

    // Rank and filter by relevance
    const userQuery = userMessages[userMessages.length - 1]?.text || '';
    const ranked = rankAndFilterApplications(related, userQuery, limit);

    // Truncate fields for AI to prevent context bloat
    return ranked.map(app => truncateFieldsForAI(app, 'basic'));
  } catch (err) {
    console.error('Warning: Failed to fetch related applications:', err.message);
    return [];
  }
};

const formatRelatedApplications = (applications) => {
  if (!applications.length) return '';
  return applications.map((app, i) => {
    const price = app.isFree || app.price === 0
      ? 'FREE'
      : `${app.currency || 'USD'} ${Number(app.price).toLocaleString()}`;
    const shop = app.sellerId?.shopName || 'VETTCODE';
    const verified = app.sellerId?.verified ? ' (Verified Seller)' : '';
    const rating = app.rating ? `⭐ ${app.rating}/5` : 'No ratings yet';
    const downloads = app.downloads ? `${app.downloads.toLocaleString()} downloads` : 'New';
    const tech = app.technologyStack?.slice(0, 3).join(', ') || 'N/A';
    const platforms = app.supportedPlatforms?.join(', ') || 'N/A';
    const desc = app.shortDescription ? app.shortDescription.slice(0, 100) : '';
    const status = app.verificationStatus === 'verified' ? '✅ Verified' : '⏳ Pending';
    return `${i + 1}. ${app.appName} — ${price} | ${rating} | ${downloads} | ${status}\n   Tech: ${tech} | Platforms: ${platforms} | Seller: ${shop}${verified}\n   ${desc}`;
  }).join('\n\n');
};

// Build the system prompt using the enhanced context builder
const buildSystemPrompt = (application, relatedApplications = [], aiContext = {}) => {
  return buildEnhancedSystemPrompt(application, aiContext, relatedApplications);
};

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { messages, product } = req.body;
    const aiContext = req.aiContext; // From middleware

    // ===== SECURITY CHECKS =====
    // 1. Rate limiting
    const { allowed, remaining } = checkRateLimit(aiContext.userId);
    if (!allowed) {
      return res.status(429).json({ 
        success: false, 
        message: 'Too many requests. Please wait a moment and try again.' 
      });
    }
    res.setHeader('X-RateLimit-Remaining', remaining);

    // 2. Validate input
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    if (!product) {
      return res.status(400).json({ success: false, message: 'Application context is required' });
    }

    // 3. Validate messages for injection/malicious content
    const validation = validateMessages(messages);
    if (!validation.valid) {
      console.warn(`[Security] Invalid message attempt: ${validation.reason} | User: ${aiContext.userId}`);
      if (validation.injection) {
        return res.status(400).json({ 
          success: false, 
          message: 'Request contains potentially unsafe content.' 
        });
      }
      return res.status(400).json({ success: false, message: validation.reason });
    }

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    // ===== FETCH RELATED APPLICATIONS =====
    let relatedApplications = [];
    if (needsComparison(messages)) {
      console.log('🔍 Comparison query detected — fetching related applications from DB...');
      relatedApplications = await getRelatedApplications(product, messages);
      console.log(`✅ Found ${relatedApplications.length} related applications`);
    }

    // ===== BUILD SYSTEM PROMPT WITH ACCESS CONTROL =====
    const systemPrompt = buildSystemPrompt(product, relatedApplications, aiContext);

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.isBot ? 'assistant' : 'user',
        content: m.text || m.content,
      })),
    ];

    console.log(`🤖 VettCode AI Chat — application: ${product.appName || product.name || product.title} | messages: ${messages.length} | user: ${aiContext.isLoggedIn ? aiContext.userEmail : 'unlogged'}`);

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
            'HTTP-Referer': 'https://vettcode.com',
            'X-Title': 'vettcode AI Assistant',
          },
          body: JSON.stringify({
            model,
            messages: prepareMessages(chatMessages, model),
            max_tokens: 4000,
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
    let aiReply = choice?.message?.content
      || choice?.message?.reasoning
      || choice?.message?.reasoning_details?.[0]?.text
      || null;

    if (!aiReply) {
      console.error('No content in AI response:', JSON.stringify(data));
      return res.status(502).json({ success: false, message: 'No response from AI', raw: data });
    }

    // ===== FILTER RESPONSE FOR SECURITY =====
    aiReply = filterResponse(aiReply, aiContext.isLoggedIn, aiContext);

    console.log(`✅ AI replied (${aiReply.length} chars)`);

    // ===== BUILD RESPONSE WITH ACCESS CONTROL =====
    const responsePayload = { success: true, reply: aiReply.trim() };
    
    if (relatedApplications.length > 0) {
      // Filter related apps based on user permissions
      responsePayload.relatedProducts = relatedApplications.map(app => {
        const isAccessible = isAppAccessible(app, aiContext);
        return {
          _id: app._id,
          title: app.appName,
          appName: app.appName,
          price: app.price,
          isFree: app.isFree,
          currency: app.currency,
          rating: app.rating,
          downloads: app.downloads,
          appCategory: app.appCategory,
          technologyStack: app.technologyStack,
          verificationStatus: app.verificationStatus,
          badges: app.badges,
          image: app.screenshots?.[0]?.url || app.screenshots?.[0]?.thumbnailUrl || null,
          shopName: app.sellerId?.shopName || 'VETTCODE',
          verified: app.sellerId?.verified || false,
          accessible: isAccessible,
          canDownload: isAccessible && (app.isFree || app.price === 0),
        };
      });
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ success: false, message: 'AI service error', error: error.message });
  }
});

module.exports = router;
