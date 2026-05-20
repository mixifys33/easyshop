const nodemailer = require('nodemailer');
require('dotenv').config();

const smtpPort = Number(process.env.SMTP_PORT) || 465;
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isSmtpConfigured() {
  const user = String(process.env.SMTP_USER || '').trim().replace(/^["']|["']$/g, '');
  const pass = String(process.env.SMTP_PASS || '').trim().replace(/^["']|["']$/g, '');
  return Boolean(user && pass);
}

function getMaskedFromEmail() {
  const email = process.env.SMTP_USER || '';
  if (!email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const maskedLocal =
    local.length <= 2 ? `${local[0] || ''}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

function getFromAddress() {
  const name = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'VettCode';
  return { name, address: process.env.SMTP_USER };
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatItemPrice(item) {
  if (item.isFree) return 'Free';
  const amount = Number(item.price) || 0;
  const currency = item.currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function buildFeaturedItemsHtml(featuredItems = []) {
  if (!featuredItems.length) return '';

  const cards = featuredItems
    .map((item) => {
      const link = escapeHtml(item.link || '#');
      const imgCell = item.image
        ? `<td style="padding:12px;width:84px;vertical-align:top;"><img src="${escapeHtml(item.image)}" alt="" width="80" height="80" style="width:80px;height:80px;object-fit:cover;border-radius:10px;display:block;" /></td>`
        : '<td style="padding:12px;width:84px;vertical-align:top;"><div style="width:80px;height:80px;border-radius:10px;background:#e2e8f0;"></div></td>';
      const sellerLine = item.sellerName
        ? `<p style="margin:0 0 6px;font-size:12px;color:#94a3b8;">by ${escapeHtml(item.sellerName)}</p>`
        : '';
      const typeLabel = item.type === 'product' ? 'Product' : 'App';

      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
          <tr>
            ${imgCell}
            <td style="padding:12px 14px 12px 0;vertical-align:top;">
              <p style="margin:0 0 4px;font-size:11px;color:#7c3aed;font-weight:700;text-transform:uppercase;">${typeLabel}</p>
              <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(item.name)}</p>
              ${sellerLine}
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.5;">${escapeHtml((item.description || '').slice(0, 140))}</p>
              <p style="margin:0 0 10px;font-size:15px;font-weight:800;color:#4F46E5;">${escapeHtml(formatItemPrice(item))}</p>
              <a href="${link}" style="display:inline-block;padding:9px 16px;background:#4F46E5;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">View on VettCode</a>
            </td>
          </tr>
        </table>`;
    })
    .join('');

  return `
    <div style="margin-top:28px;padding-top:22px;border-top:2px solid #e2e8f0;">
      <p style="margin:0 0 6px;font-size:17px;font-weight:800;color:#0f172a;">Featured on VettCode</p>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b;">Hand-picked for you — tap any item to explore</p>
      ${cards}
    </div>`;
}

function sanitizeFeaturedItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 6)
    .filter((item) => item && item.name && item.id)
    .map((item) => ({
      id: String(item.id),
      type: item.type === 'product' ? 'product' : 'application',
      name: String(item.name).slice(0, 120),
      description: String(item.description || '').slice(0, 200),
      price: item.price,
      currency: item.currency || 'USD',
      isFree: Boolean(item.isFree),
      image: item.image ? String(item.image).slice(0, 500) : null,
      sellerName: item.sellerName ? String(item.sellerName).slice(0, 80) : '',
      link: item.link ? String(item.link).slice(0, 500) : null,
    }));
}

function buildCommunicationHtml({
  subject,
  message,
  recipientName,
  audienceLabel,
  featuredItems = [],
  ctaLabel,
  ctaUrl,
}) {
  const safeSubject = escapeHtml(subject);
  const bodyHtml = escapeHtml(message).replace(/\n/g, '<br/>');
  const year = new Date().getFullYear();
  const featuredHtml = buildFeaturedItemsHtml(featuredItems);
  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<div style="text-align:center;margin:26px 0 4px;">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">${escapeHtml(ctaLabel)}</a>
        </div>`
      : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>',
    '<body style="font-family:Segoe UI,Tahoma,sans-serif;background:#f1f5f9;margin:0;padding:24px;">',
    '<div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 24px rgba(15,23,42,0.06);">',
    '<div style="background:linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%);padding:32px 24px;text-align:center;">',
    '<p style="margin:0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:2px;text-transform:uppercase;">VettCode</p>',
    `<p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${escapeHtml(audienceLabel)}</p>`,
    `<h1 style="margin:14px 0 0;color:#ffffff;font-size:24px;font-weight:800;line-height:1.3;">${safeSubject}</h1>`,
    '</div>',
    '<div style="padding:28px 24px;">',
    `<p style="margin:0 0 18px;color:#334155;font-size:16px;">Hi <strong>${escapeHtml(recipientName || 'there')}</strong>,</p>`,
    `<div style="color:#475569;font-size:15px;line-height:1.75;">${bodyHtml}</div>`,
    ctaHtml,
    featuredHtml,
    '</div>',
    '<div style="background:#f8fafc;padding:22px 24px;text-align:center;border-top:1px solid #e2e8f0;">',
    '<p style="margin:0;color:#64748b;font-size:13px;">Questions? Reply to this email — we are happy to help.</p>',
    `<p style="margin:10px 0 0;color:#94a3b8;font-size:11px;">&copy; ${year} VettCode · Marketplace for apps &amp; digital products</p>`,
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');
}

async function verifySmtpConnection() {
  if (!isSmtpConfigured()) {
    return { ready: false, error: 'SMTP credentials are not configured in environment variables' };
  }
  try {
    await transporter.verify();
    return { ready: true };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

async function sendCommunicationEmail({
  to,
  name,
  subject,
  message,
  audienceLabel,
  featuredItems,
  ctaLabel,
  ctaUrl,
}) {
  const html = buildCommunicationHtml({
    subject,
    message,
    recipientName: name,
    audienceLabel,
    featuredItems,
    ctaLabel,
    ctaUrl,
  });

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
    text: `Hello ${name || 'there'},\n\n${message}\n\n— VettCode`,
  });

  return { success: true, messageId: info.messageId };
}

async function sendBulkCommunications({
  recipients,
  subject,
  message,
  audienceLabel,
  featuredItems = [],
  ctaLabel,
  ctaUrl,
}) {
  if (!isSmtpConfigured()) {
    return {
      success: false,
      error: 'SMTP is not configured. Set SMTP_USER and SMTP_PASS in your .env file.',
      sent: 0,
      failed: recipients.length,
      results: [],
    };
  }

  const verification = await verifySmtpConnection();
  if (!verification.ready) {
    console.warn('[AdminEmail] SMTP verify failed (will still attempt send):', verification.error);
  }

  const safeFeatured = sanitizeFeaturedItems(featuredItems);
  const results = [];
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    if (!recipient.email) {
      failed += 1;
      results.push({
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
        success: false,
        error: 'Missing email address',
      });
      continue;
    }

    try {
      const result = await sendCommunicationEmail({
        to: recipient.email,
        name: recipient.name,
        subject,
        message,
        audienceLabel,
        featuredItems: safeFeatured,
        ctaLabel,
        ctaUrl,
      });
      sent += 1;
      results.push({
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
        success: true,
        messageId: result.messageId,
      });
    } catch (err) {
      failed += 1;
      results.push({
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
        success: false,
        error: err.message,
      });
    }

    await sleep(120);
  }

  return {
    success: sent > 0,
    sent,
    failed,
    total: recipients.length,
    results,
  };
}

module.exports = {
  isSmtpConfigured,
  getMaskedFromEmail,
  verifySmtpConnection,
  sendBulkCommunications,
  sanitizeFeaturedItems,
};
