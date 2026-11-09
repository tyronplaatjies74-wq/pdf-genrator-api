import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function sendVerificationEmail(email, token) {
  const verifyUrl = `${env.APP_URL || 'http://localhost:3000'}/verify.html?token=${token}`;

  // Log in dev / replace with your actual ESP (Resend, Nodemailer, SendGrid, etc.)
  if (process.env.NODE_ENV !== 'production') {
    logger.info({ email, verifyUrl }, '[DEV] Email verification link generated');
    return;
  }

  // Example using Nodemailer or Resend:
  /*
  await resend.emails.send({
    from: 'PDF Generator <noreply@yourdomain.com>',
    to: email,
    subject: 'Verify your API key request',
    html: `<p>Click the link below to verify your email and activate your API key:</p>
           <a href="${verifyUrl}">${verifyUrl}</a>
           <p>This link expires in 15 minutes.</p>`,
  });
  */
}