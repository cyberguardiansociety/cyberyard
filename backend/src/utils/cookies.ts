import { Response } from 'express';
import { env } from '../config/env';

export function setSessionCookie(res: Response, token: string, expiresAt: Date, rememberMe = false): void {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    ...(rememberMe ? { expires: expiresAt } : {}),
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    path: '/',
  });
}
