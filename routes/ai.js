const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();
const Application = require('../models/Application');

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

// Fetch up to 6 related applications from the same category (excluding current)
const getRelatedApplications = async (application) => {
  try {
    const query = {
      verificationStatus: 'verified',
      isActive: true,
      isDraft: { $ne: true },
    };
    if (application._id || application.id) {
      query._id = { $ne: application._id || application.id };
    }
    if (application.appCategory) query.appCategory = application.appCategory;

    const related = await Application.find(query)
      .select('appName price isFree currency appCategory subCategory technologyStack supportedPlatforms rating downloads verificationStatus shortDescription screenshots badges')
      .populate('sellerId', 'shopName verified')
      .sort({ downloads: -1, rating: -1 })
      .limit(6)
      .lean();

    return related;
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

// Build the system prompt with full application context
const buildSystemPrompt = (application, relatedApplications = []) => {
  const price = application.isFree || application.price === 0
    ? 'FREE'
    : application.price
    ? `${application.currency || 'USD'} ${Number(application.price).toLocaleString()}`
    : 'Contact seller';

  const tech = application.technologyStack?.join(', ') || 'Not specified';
  const platforms = application.supportedPlatforms?.join(', ') || 'Not specified';
  const techRequirements = application.technicalRequirements?.map(r => `- ${r.name}: ${r.value}`).join('\n') || 'Not specified';
  const dependencies = application.dependencies?.map(d => `- ${d.name} ${d.version ? `(${d.version})` : ''}: ${d.description || ''}`).join('\n') || 'Not specified';
  const badges = application.badges?.join(', ') || 'None';

  const relatedSection = relatedApplications.length > 0
    ? `\nOTHER AVAILABLE APPLICATIONS IN THE SAME CATEGORY (real data from VETTCODE):\n${formatRelatedApplications(relatedApplications)}\n\nWhen the user asks for comparisons, alternatives, cheaper or better options — use ONLY the applications listed above. Never invent or mention applications not listed here.\n`
    : '';

  return `You are VettCode AI, a helpful AI assistant for VETTCODE, a global marketplace for verified, production-ready applications and codebases. You NEVER answer in table format. When data needs to be structured, organized, or compared, DO NOT use rows and columns. Instead, use nested bulleted lists, bold text for headers, and paragraphs. Ensure all information is presented as clean text or markdown bullet points only.

Do not recommend other platforms or marketplaces. If the user needs something not shown, direct them to use the search bar on VETTCODE.

CURRENT APPLICATION:
- Name: ${application.appName || application.name || application.title || 'Unknown'}
- Price: ${price}
- Category: ${application.appCategory || 'N/A'}
- Sub-category: ${application.subCategory || 'N/A'}
- Technology Stack: ${tech}
- Supported Platforms: ${platforms}
- License Type: ${application.licenseType || 'Not specified'}
- Commercial Use: ${application.commercialUse || 'Not specified'}
- Resale Rights: ${application.resaleRights || 'Not specified'}
- Rating: ${application.rating ? `⭐ ${application.rating}/5` : 'No ratings yet'}
- Downloads: ${application.downloads ? `${application.downloads.toLocaleString()} downloads` : 'New application'}
- Views: ${application.views ? `${application.views.toLocaleString()} views` : '0 views'}
- Verification Status: ${application.verificationStatus === 'verified' ? '✅ Production-Ready & Verified' : '⏳ Under Review'}
- Badges: ${badges}
- Short Description: ${application.shortDescription || 'No description'}
- Detailed Description: ${application.detailedDescription || 'No detailed description available'}
- Seller/Developer: ${application.seller?.name || 'VETTCODE'}
- Seller Verified: ${application.seller?.verified ? 'Yes ✅' : 'No'}
- Support Level: ${application.supportLevel || 'Community'}
- Update Frequency: ${application.updateFrequency || 'Active'}
- Installation Support: ${application.installationSupport || 'Yes'}
- Warranty: ${application.warranty || '30 days'}
- Live Demo: ${application.liveDemo || 'Not available'}
- GitHub Repo: ${application.githubRepo || 'Not available'}
- Documentation: ${application.documentationUrl || 'Not available'}
- Video Demo: ${application.videoDemo || 'Not available'}

TECHNICAL REQUIREMENTS:
${techRequirements}

DEPENDENCIES:
${dependencies}
${relatedSection}
YOUR ROLE:
- Answer questions about this application honestly and helpfully
- Help developers decide if this application suits their project needs
- Explain technical specifications, tech stack, and implementation details clearly
- Compare with real alternatives from VETTCODE when asked
- Discuss security, scalability, and production-readiness
- Provide insights on licensing, commercial use, and resale rights
- Be concise — short and direct unless detail is needed
- Never make up specs, prices, features, or applications not listed above
- Always be professional, friendly, and supportive
- Focus on code quality, developer experience, and business value

The user is viewing this application and does NOT need to re-explain what they're looking at.`;
};

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { messages, product } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ success: false, message: 'Messages array is required' });
    }

    if (!product) {
      return res.status(400).json({ success: false, message: 'Application context is required' });
    }

    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    // Fetch related applications if the user is asking for comparisons/alternatives
    let relatedApplications = [];
    if (needsComparison(messages)) {
      console.log('🔍 Comparison query detected — fetching related applications from DB...');
      relatedApplications = await getRelatedApplications(product);
      console.log(`✅ Found ${relatedApplications.length} related applications`);
    }

    const systemPrompt = buildSystemPrompt(product, relatedApplications);

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.isBot ? 'assistant' : 'user',
        content: m.text,
      })),
    ];

    console.log(`🤖 VettCode AI Chat — application: ${product.appName || product.name || product.title} | messages: ${messages.length}`);

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

    // Include related applications in response so frontend can render comparison cards
    const responsePayload = { success: true, reply: aiReply.trim() };
    if (relatedApplications.length > 0) {
      responsePayload.relatedProducts = relatedApplications.map(app => ({
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
      }));
    }
    res.json(responsePayload);

  } catch (error) {
    console.error('AI chat error:', error);
    res.status(500).json({ success: false, message: 'AI service error', error: error.message });
  }
});

module.exports = router;
