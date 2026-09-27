import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Result of a send attempt. `{ skipped: true }` means nothing was
 * attempted (email disabled or SMTP not configured) — auth flows treat it
 * as a normal no-op, never a failure.
 */
export interface EmailSendResult {
  skipped: boolean;
  reason?: 'email_disabled' | 'smtp_not_configured';
}

/**
 * Offline-first guard: with EMAIL_ENABLED=false no transport is ever
 * created and no network call happens. Missing SMTP config in development
 * is likewise a logged skip instead of a throw, so auth flows (password
 * reset, verification) never hard-fail on email — callers already log
 * genuine send failures via their `.catch` (see services/auth.service.ts).
 */
function skipReason(): 'email_disabled' | 'smtp_not_configured' | null {
  if (!env.EMAIL_ENABLED) return 'email_disabled';
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) return 'smtp_not_configured';
  return null;
}

function logSkip(reason: 'email_disabled' | 'smtp_not_configured'): EmailSendResult {
  logger.info('email_skipped', { reason });
  return { skipped: true, reason };
}

function assertConfigured(): void {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
  }
}

function transporter() {
  assertConfigured();
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

function link(path: string, token: string): string {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  // The token is kept in the URL fragment so it is not sent to the frontend
  // static server or reverse-proxy access logs. The SPA POSTs it to the API.
  return `${base}/#${path}?token=${encodeURIComponent(token)}`;
}

export async function sendEmailVerificationEmail(email: string, token: string): Promise<EmailSendResult> {
  const reason = skipReason();
  if (reason) return logSkip(reason);
  await transporter().sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: 'Verify your CyberYardHub email',
    text: `Verify your CyberYardHub email address here: ${link('verify-email', token)}\n\nThis link expires in 24 hours and can only be used once.`,
    html: `<div style="background:#070a13;color:#eef1ff;padding:32px;font-family:Arial,sans-serif"><h2>Verify your CyberYardHub email</h2><p>Confirm your email address to keep your account recovery channel current.</p><p><a href="${link('verify-email', token)}" style="display:inline-block;padding:12px 18px;background:#8b5cf6;color:#fff;text-decoration:none;border-radius:8px">Verify email</a></p><p style="color:#aab0c5">This link expires in 24 hours and can only be used once.</p></div>`,
  });
  return { skipped: false };
}
