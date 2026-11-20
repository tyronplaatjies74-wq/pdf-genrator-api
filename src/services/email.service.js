import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const API_URL = 'https://api.resend.com/emails';
const COOLDOWN_MS = 60_000;

// Protections so the signup form cannot be used to spam someone's inbox or use up the provider's daily limit.
const lastSent = new Map(); // email -> time of the last send
let day = '';
let sentToday = 0;
setInterval(() => {
  const cutoff = Date.now() - COOLDOWN_MS;
  for (const [k, t] of lastSent) if (t < cutoff) lastSent.delete(k);
}, COOLDOWN_MS).unref();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function checkLimits(email) {
  const now = Date.now();
  const last = lastSent.get(email);
  if (last && now - last < COOLDOWN_MS) {
    throw new HttpError(429, 'rate_limited', 'A verification email was just sent. Please wait a minute before asking for another.');
  }
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) { day = today; sentToday = 0; }
  if (sentToday >= env.EMAIL_DAILY_LIMIT) {
    throw new HttpError(503, 'email_unavailable', 'We cannot send more verification emails right now. Please try again tomorrow.');
  }
}

function buildMessage(verifyUrl) {
  const text = [
    'Hi,',
    '',
    'Open this link to verify your email and get your PDF API key:',
    verifyUrl,
    '',
    'The link works for 15 minutes. If you did not ask for it, you can ignore this email.',
  ].join('\n');
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;color:#1f2933;line-height:1.5">
<h2 style="margin:0 0 12px">Verify your email</h2>
<p>Click the button to verify your email and get your PDF API key.</p>
<p style="margin:24px 0"><a href="${esc(verifyUrl)}" style="background:#111827;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify my email</a></p>
<p style="font-size:13px;color:#616e7c">Or paste this link into your browser:<br>${esc(verifyUrl)}</p>
<p style="font-size:13px;color:#616e7c">The link works for 15 minutes. If you did not ask for it, you can ignore this email.</p>
</div>`;
  return { text, html };
}

export async function sendVerificationEmail(email, token) {
  const verifyUrl = `${env.APP_URL || 'http://localhost:3000'}/verify.html?token=${token}`;

  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      throw new HttpError(503, 'email_unavailable', 'Email sending is not configured.');
    }
    logger.info({ email, verifyUrl }, '[DEV] Email verification link generated'); // no key set: show the link in the log instead
    return;
  }

  checkLimits(email);
  lastSent.set(email, Date.now()); // set first, so two quick clicks cannot send two emails
  const failed = (why, extra) => {
    lastSent.delete(email); // a failed send should not make the person wait
    logger.error({ ...extra }, why);
    return new HttpError(502, 'email_failed', 'We could not send the verification email. Please try again.');
  };

  const { text, html } = buildMessage(verifyUrl);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [email],
        subject: 'Verify your email to get your API key',
        html,
        text,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw failed('email provider unreachable', { err: err.message });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw failed('email provider rejected the message', { status: res.status, detail });
  }
  sentToday++;
  logger.info({ status: res.status }, 'verification email sent');
}
