const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: String(process.env.SMTP_PORT) === '465' || process.env.SMTP_SECURE !== 'false',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
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

function buildCommunicationHtml({ subject, message, recipientName, audienceLabel }) {
  const safeSubject = escapeHtml(subject);
  const bodyHtml = escapeHtml(message).replace(/\n/g, '<br/>');
  const year = new Date().getFullYear();

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>',
    '<body style="font-family:Segoe UI,Tahoma,sans-serif;background:#f8fafc;margin:0;padding:24px;">',
    '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">',
    '<div style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:28px 24px;text-align:center;">',
    `<p style="margin:0;color:#fff;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.9;">VettCode ${escapeHtml(audienceLabel)}</p>`,
    `<h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">${safeSubject}</h1>`,
    '</div>',
    '<div style="padding:28px 24px;">',
    `<p style="margin:0 0 16px;color:#334155;font-size:15px;">Hello ${escapeHtml(recipientName || 'there')},</p>`,
    `<div style="color:#475569;font-size:15px;line-height:1.7;">${bodyHtml}</div>`,
    '</div>',
    '<div style="background:#f1f5f9;padding:20px 24px;text-align:center;border-top:1px solid #e2e8f0;">',
    '<p style="margin:0;color:#64748b;font-size:12px;">This message was sent by the VettCode admin team.</p>',
    `<p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">&copy; ${year} VettCode</p>`,
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

async function sendCommunicationEmail({ to, name, subject, message, audienceLabel }) {
  const html = buildCommunicationHtml({
    subject,
    message,
    recipientName: name,
    audienceLabel,
  });

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
    text: `Hello ${name || 'there'},\n\n${message}\n\n— VettCode Admin`,
  });

  return { success: true, messageId: info.messageId };
}

async function sendBulkCommunications({ recipients, subject, message, audienceLabel }) {
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
    return {
      success: false,
      error: verification.error || 'SMTP connection failed',
      sent: 0,
      failed: recipients.length,
      results: [],
    };
  }

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
};
