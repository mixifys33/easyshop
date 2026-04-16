const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Vision-capable free models in priority order — updated April 2026
const VISION_MODELS = [
  'qwen/qwen2.5-vl-72b-instruct:free',
  'meta-llama/llama-4-scout:free',
  'google/gemini-2.0-flash-exp:free',
  'moonshotai/kimi-vl-a3b-thinking:free',
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'meta-llama/llama-4-maverick:free',
];

// Call AI with model fallback — returns parsed result or null
async function callAI(messages) {
  let lastError = null;
  for (const model of VISION_MODELS) {
    console.log(`🔍 Payment verify — trying: ${model}`);
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://easyshop.com',
          'X-Title': 'EasyShop Payment Verification',
        },
        body: JSON.stringify({ model, messages, max_tokens: 800, temperature: 0.1 }),
      });

      const rawText = await response.text();
      if (response.status === 429 || response.status === 503) { lastError = rawText; continue; }
      if (!response.ok) {
        console.error(`Model ${model} error ${response.status}:`, rawText.substring(0, 120));
        lastError = rawText;
        continue;
      }

      const data = JSON.parse(rawText);
      const rawReply = data.choices?.[0]?.message?.content || '';

      // Strip markdown fences then extract JSON
      const stripped = rawReply.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`Model ${model} returned non-JSON:`, rawReply.substring(0, 200));
        lastError = 'non-JSON response';
        continue;
      }

      const result = JSON.parse(jsonMatch[0]);
      console.log(`✅ Payment verify response from: ${model} — verified=${result.verified}`);
      return result;
    } catch (e) {
      lastError = e.message;
      continue;
    }
  }
  console.error('All vision models failed. Last error:', String(lastError).substring(0, 200));
  return null;
}

// Build the strict per-image verification prompt
function buildPrompt(imageIndex, totalImages, expectedRecipientName, expectedPhone, amountFormatted, productNames, methodLabel) {
  return `You are a strict payment fraud detection AI for an e-commerce platform in Uganda.
You are verifying screenshot ${imageIndex} of ${totalImages} INDIVIDUALLY.

IMPORTANT: This is a financial transaction. Be strict. Do NOT pass if you are unsure.

Check this single image for ALL of the following:

1. RECIPIENT NAME — Must match or closely resemble: "${expectedRecipientName || 'N/A'}". Partial name match is OK but must be recognisable.
2. PHONE NUMBER — Must match: "${expectedPhone || 'N/A'}". Digits must match exactly.
3. AMOUNT — Must match: ${amountFormatted}. Allow ±5% tolerance only.
4. REASON/REFERENCE — Should relate to: "${productNames || 'product payment'}". Any word overlap is fine.
5. MESSAGE FORMAT — Must look like a genuine ${methodLabel} send-money confirmation SMS or app screenshot. NOT a chat message, NOT a received-money notification, NOT a balance check.
6. NOT FAKE — Must appear genuine. Reject if: text looks copy-pasted, fonts are inconsistent, background is plain white with no UI chrome, amounts or names look edited, or the image is AI-generated.
7. DUPLICATE CHECK — This is image ${imageIndex}. If this image looks identical or nearly identical to what you would expect the other screenshot to be (same transaction, same timestamp, same amount), note it.

STRICT RULES:
- If notFake fails → verified MUST be false, no exceptions.
- If messageFormat fails → verified MUST be false.
- If both recipientName AND phoneNumber fail → verified MUST be false.
- If amount is wrong by more than 5% → verified MUST be false.
- When in doubt → set verified to false. This is a money transaction.

Respond ONLY with valid JSON, no markdown, no text outside the JSON:
{
  "verified": true,
  "confidence": "high",
  "imageIndex": ${imageIndex},
  "checks": {
    "recipientName": { "pass": true, "found": "name seen", "expected": "${expectedRecipientName || 'N/A'}" },
    "phoneNumber": { "pass": true, "found": "number seen", "expected": "${expectedPhone || 'N/A'}" },
    "amount": { "pass": true, "found": "amount seen", "expected": "${amountFormatted}" },
    "reason": { "pass": true, "found": "reason text seen" },
    "messageFormat": { "pass": true, "note": "looks like genuine confirmation" },
    "notFake": { "pass": true, "note": "image appears genuine" }
  },
  "summary": "One sentence summary for this image",
  "rejectionReason": null
}`;
}

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
    if (imageUrls.length < 2) {
      return res.status(400).json({ success: false, message: 'Two proof screenshots are required' });
    }
    if (!OPENROUTER_API_KEY) {
      return res.status(500).json({ success: false, message: 'AI service not configured' });
    }

    const methodLabel = paymentMethod === 'mtn' ? 'MTN Mobile Money'
      : paymentMethod === 'airtel' ? 'Airtel Money'
      : paymentMethod === 'bank' ? 'Bank Transfer'
      : 'Mobile Money';

    const amountFormatted = expectedAmount ? `UGX ${Number(expectedAmount).toLocaleString()}` : 'N/A';

    // ── Verify each image INDEPENDENTLY ──────────────────────────────────────
    console.log(`🔍 Verifying ${imageUrls.length} images independently...`);

    const perImageResults = await Promise.all(imageUrls.map(async (url, idx) => {
      const systemPrompt = buildPrompt(
        idx + 1, imageUrls.length,
        expectedRecipientName, expectedPhone,
        amountFormatted, productNames, methodLabel
      );

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url, detail: 'high' } },
            { type: 'text', text: `Verify this payment screenshot (image ${idx + 1} of ${imageUrls.length}). Return only the JSON.` },
          ],
        },
      ];

      const result = await callAI(messages);
      if (!result) {
        return {
          verified: null,
          confidence: 'low',
          imageIndex: idx + 1,
          checks: {},
          summary: `Could not verify image ${idx + 1} automatically.`,
          rejectionReason: null,
        };
      }
      return { ...result, imageIndex: idx + 1 };
    }));

    // ── Cross-check: detect duplicate images ──────────────────────────────────
    let duplicateWarning = null;
    if (perImageResults.length === 2) {
      const r1 = perImageResults[0];
      const r2 = perImageResults[1];
      const phone1 = r1.checks?.phoneNumber?.found || '';
      const phone2 = r2.checks?.phoneNumber?.found || '';
      const amount1 = r1.checks?.amount?.found || '';
      const amount2 = r2.checks?.amount?.found || '';
      if (phone1 && phone2 && phone1 === phone2 && amount1 && amount2 && amount1 === amount2) {
        duplicateWarning = 'Both screenshots appear to show the same transaction. Please upload two different confirmation screenshots.';
      }
    }

    const allVerified = perImageResults.every(r => r.verified === true);
    const anyFailed   = perImageResults.some(r => r.verified === false);

    // ── Final verdict: BOTH must pass independently ───────────────────────────
    let finalVerified, finalSummary, finalRejectionReason = null;

    if (duplicateWarning) {
      finalVerified = false;
      finalSummary = 'Duplicate screenshots detected.';
      finalRejectionReason = duplicateWarning;
    } else if (allVerified) {
      finalVerified = true;
      finalSummary = 'Both screenshots verified successfully.';
    } else if (anyFailed) {
      finalVerified = false;
      const failedIndexes = perImageResults
        .filter(r => r.verified === false)
        .map(r => `Screenshot ${r.imageIndex}: ${r.rejectionReason || r.summary}`)
        .join(' | ');
      finalSummary = 'One or more screenshots failed verification.';
      finalRejectionReason = failedIndexes;
    } else {
      finalVerified = null;
      finalSummary = 'Could not automatically verify all screenshots. An admin will review your payment.';
    }

    // Merge checks from both images for display
    const mergedChecks = {};
    perImageResults.forEach((r, idx) => {
      Object.entries(r.checks || {}).forEach(([key, val]) => {
        mergedChecks[`img${idx + 1}_${key}`] = val;
      });
    });

    const overallConfidence = allVerified ? 'high' : anyFailed ? 'low' : 'medium';
    console.log(`✅ Final verdict: verified=${finalVerified}, confidence=${overallConfidence}`);

    res.json({
      success: true,
      result: {
        verified: finalVerified,
        confidence: overallConfidence,
        checks: mergedChecks,
        perImageResults,
        summary: finalSummary,
        rejectionReason: finalRejectionReason,
        duplicateWarning,
      },
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, message: 'Verification service error: ' + error.message });
  }
});

module.exports = router;
