/**
 * A typed error carrying an HTTP status code, thrown from controllers or
 * services and turned into a consistent JSON error response by
 * `errorHandler` middleware. Future auth/validation/business-logic errors
 * should throw this instead of a plain Error, so the client always gets a
 * predictable `{ error: { message, code? } }` shape.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  /** Optional Retry-After hint (seconds) for throttling errors — the
   *  error handler emits it as the standard header on 429 responses. */
  public readonly retryAfterSeconds?: number;

  constructor(statusCode: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
