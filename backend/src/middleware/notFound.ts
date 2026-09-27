import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

/**
 * Catches any request that didn't match a route and turns it into a
 * consistent 404 JSON response via the error handler, instead of Express's
 * default HTML error page. The requested URL is HTML-escaped before being
 * embedded in the message so a crafted path (e.g. `<script>…`) can never be
 * reflected as markup if the error is ever rendered as HTML.
 */
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Route not found: ${req.method} ${escapeHtml(req.originalUrl)}`));
}
