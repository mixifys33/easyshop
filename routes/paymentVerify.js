const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Vision-capable free models in priority order
const VISION_MODELS = [
    'openrouter/auto',
    'openrouter/polaris-alpha',
    'openrouter/hunter-alpha',
    'openrouter/healer-alpha',
  'google/lyria-3-pro-preview',
  'qwen/qwen3.6-plus:free',
  'google/lyria-3-clip-preview',
  'openrouter/free',
  'openrouter/bert-nebulon-alpha',
  'openrouter/sherlock-think-alpha',
  'google/gemma-3-4b-it:free',
  'google/gemma-3-12b-it:free',
  'openrouter/andromeda-alpha',
  'google/gemma-3-27b-it:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
];

// POST /api/payment-verify
router.post('/', async (req, res) => {
  try {
    const {
      imageUrls,
      expectedAmount,
      expectedRecipientName,
      expectedPhone,
      productNames,
      paymentMethod,
    } = req.body;

    if (!imageUrls || imageUrls.length === 0) {
      return res.status(400).json({ success: false, message: 'No images provided' });
    }
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    const methodLabel = paymentMethod === 'mtn' ? 'MTN Mobile Money'
      : paymentMethod === 'airtel' ? 'Airtel Money'
      : paymentMethod === 'bank' ? 'Bank Transfer'
      : 'Mobile Money';

    const amountFormatted = expectedAmount ? `UGX ${Number(expectedAmount).toLocaleString()}` : 'N/A';

    const systemPrompt = `You are a payment verification AI for an e-commerce platform in Uganda.
Analyze the payment confirmation screenshots provided and determine if they are valid.

Check ALL of the following:
1. RECIPIENT NAME — Does the name in the screenshot match or closely resemble: "${expectedRecipientName || 'N/A'}"? Partial or similar match is acceptable.
2. PHONE NUMBER — Does the phone number in the screenshot match: "${expectedPhone || 'N/A'}"?
3. AMOUNT — Does the amount paid match: ${amountFormatted}?
4. REASON/REFERENCE — Does the reason or reference field relate to: "${productNames || 'product payment'}"? Any partial match is fine.
5. MESSAGE FORMAT — Does this look like a genuine ${methodLabel} send-money confirmation SMS or app screenshot? Not a chat message, not a different type of transaction.
6. NOT FAKE — Does this image appear genuine and not AI-generated, edited, or fabricated?

Scoring rules:
- If recipientName and phoneNumber both pass → strong signal to verify
- If amount is within 5% of expected → pass
- If reason has any word overlap with product name → pass
- If notFake fails → always set verified to false

Respond ONLY with valid JSON, no markdown, no explanation outside the JSON:
{
  "verified": true,
  "confidence": "high",
  "checks": {
    "recipientName": { "pass": true, "found": "name seen in image", "expected": "${expectedRecipientName || 'N/A'}" },
    "phoneNumber": { "pass": true, "found": "number seen", "expected": "${expectedPhone || 'N/A'}" },
    "amount": { "pass": true, "found": "amount seen", "expected": "${amountFormatted}" },
    "reason": { "pass": true, "found": "reason text seen" },
    "messageFormat": { "pass": true, "note": "looks like genuine MTN confirmation" },
    "notFake": { "pass": true, "note": "image appears genuine" }
  },
  "summary": "One sentence summary of the result",
  "rejectionReason": null
}`;

    const imageContent = imageUrls.map(url => ({
      type: 'image_url',
      image_url: { url, detail: 'high' },
    }));

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          ...imageContent,
          { type: 'text', text: 'Verify these payment screenshots. Return only the JSON, no extra text.' },
        ],
      },
    ];

    let data = null;
    let lastError = null;

    for (const model of VISION_MODELS) {
      console.log(`🔍 Payment verify — trying: ${model}`);
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://alloutgadgets.com',
            'X-Title': 'AllOutGadgets Payment Verification',
          },
          body: JSON.stringify({ model, messages, max_tokens: 800, temperature: 0.1 }),
        });

        const rawText = await response.text();
        if (response.status === 429 || response.status === 503) {
          lastError = rawText;
          continue;
        }
        if (!response.ok) {
          console.error(`Model ${model} error ${response.status}:`, rawText.substring(0, 150));
          lastError = rawText;
          continue;
        }

        data = JSON.parse(rawText);
        console.log(`✅ Payment verify response from: ${model}`);
        break;
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    if (!data) {
      console.error('All vision models failed. Last error:', String(lastError).substring(0, 200));
      return res.status(502).json({ success: false, message: 'AI verification service temporarily unavailable. You can still proceed manually.' });
    }

    const rawReply = data.choices?.[0]?.message?.content || '';

    let result;
    try {
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
      result = JSON.parse(jsonMatch ? jsonMatch[0] : rawReply);
    } catch (e) {
      console.error('Failed to parse verification JSON:', rawReply.substring(0, 300));
      // Return a soft failure so user can still proceed
      return res.json({
        success: true,
        result: {
          verified: null,
          confidence: 'low',
          checks: {},
          summary: 'Could not automatically verify. Please ensure your screenshots are clear.',
          rejectionReason: null,
        },
      });
    }

    console.log(`✅ Verification: verified=${result.verified}, confidence=${result.confidence}`);
    res.json({ success: true, result });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, message: 'Verification service error: ' + error.message });
  }
});

module.exports = router;
