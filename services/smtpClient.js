/**
 * Reliable outbound email for cloud hosts (Render blocks SMTP port 465 often).
 * Priority: Resend HTTP API (if RESEND_API_KEY) → Gmail SMTP 587 → Gmail SMTP 465
 */
const nodemailer = require('nodemailer');
const fetch = require('node-fetch');
require('dotenv').config();

const TRANSPORT_VERSION = 3;
const PORT_TRY_ORDER = [587, 465];
const CONNECT_MS = 10000;

function cleanEnv(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function getSmtpAuth() {
  return {
    user: cleanEnv(process.env.SMTP_USER),
    pass: cleanEnv(process.env.SMTP_PASS),
  };
}

function createSmtpTransport(port) {
  const secure = port === 465;
  return nodemailer.createTransport({
    host: cleanEnv(process.env.SMTP_HOST) || 'smtp.gmail.com',
    port,
    secure,
    auth: getSmtpAuth(),
    connectionTimeout: CONNECT_MS,
    greetingTimeout: CONNECT_MS,
    socketTimeout: CONNECT_MS + 2000,
    ...(port === 587 ? { requireTLS: true } : {}),
  });
}

async function sendViaResend(mailOptions) {
  const apiKey = cleanEnv(process.env.RESEND_API_KEY);
  if (!apiKey) return null;

  const auth = getSmtpAuth();
  const fromAddress = cleanEnv(process.env.RESEND_FROM) || auth.user;
  const fromName = cleanEnv(process.env.SMTP_FROM_NAME) || 'VettCode';
  const from = fromAddress.includes('<')
    ? fromAddress
    : `${fromName} <${fromAddress}>`;

  const toList = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];

  console.log('[smtp] Resend HTTP send start', { to: toList, subject: mailOptions.subject?.slice(0, 50) });
  const started = Date.now();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: toList,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Resend API error ${res.status}`);
  }

  console.log('[smtp] Resend OK', { ms: Date.now() - started, id: data.id });
  return { messageId: data.id, provider: 'resend' };
}

async function sendViaSmtpPort(mailOptions, port) {
  const transport = createSmtpTransport(port);
  const started = Date.now();
  console.log(`[smtp] Gmail port ${port} send start`, { to: mailOptions.to });

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`[smtp] Gmail port ${port} OK`, { ms: Date.now() - started, messageId: info.messageId });
    return info;
  } finally {
    try {
      transport.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Send email — fast on Render when RESEND_API_KEY is set; otherwise tries SMTP 587 then 465.
 */
async function sendMailReliable(mailOptions) {
  const started = Date.now();
  console.log('[smtp] sendMailReliable v' + TRANSPORT_VERSION, {
    to: mailOptions.to,
    subject: String(mailOptions.subject || '').slice(0, 60),
    resendConfigured: Boolean(cleanEnv(process.env.RESEND_API_KEY)),
  });

  if (cleanEnv(process.env.RESEND_API_KEY)) {
    try {
      return await sendViaResend(mailOptions);
    } catch (err) {
      console.warn('[smtp] Resend failed, falling back to SMTP:', err.message);
    }
  }

  const auth = getSmtpAuth();
  if (!auth.user || !auth.pass) {
    throw new Error(
      'SMTP_USER and SMTP_PASS missing on server. On Render, also set RESEND_API_KEY (resend.com) — SMTP is often blocked.'
    );
  }

  const preferred = Number(process.env.SMTP_PORT) || 465;
  const ports =
    preferred === 465 ? [465, 587] : [587, 465];

  let lastError;
  for (const port of ports) {
    try {
      return await sendViaSmtpPort(mailOptions, port);
    } catch (err) {
      lastError = err;
      console.error(`[smtp] Gmail port ${port} FAILED`, {
        code: err.code,
        message: err.message,
        command: err.command,
      });
    }
  }

  const ms = Date.now() - started;
  throw new Error(
    `${lastError?.message || 'SMTP connection failed'} (${ms}ms). ` +
      'Cloud hosts often block Gmail SMTP. Add RESEND_API_KEY to Render environment (free tier at resend.com).'
  );
}

async function verifySmtpReliable() {
  if (cleanEnv(process.env.RESEND_API_KEY)) {
    return { ready: true, provider: 'resend' };
  }
  const auth = getSmtpAuth();
  if (!auth.user || !auth.pass) {
    return { ready: false, error: 'SMTP credentials not configured' };
  }
  for (const port of PORT_TRY_ORDER) {
    const transport = createSmtpTransport(port);
    try {
      await transport.verify();
      transport.close();
      return { ready: true, provider: 'gmail', port };
    } catch (err) {
      try {
        transport.close();
      } catch {
        /* ignore */
      }
    }
  }
  return { ready: false, error: 'Could not verify SMTP on ports 587 or 465' };
}

module.exports = {
  TRANSPORT_VERSION,
  sendMailReliable,
  verifySmtpReliable,
  cleanEnv,
  getSmtpAuth,
};
