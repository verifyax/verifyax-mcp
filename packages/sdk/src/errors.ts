// Typed error hierarchy for the VerifyAX SDK.
//
// The SDK never throws a plain Error. Every failure is one of these classes so
// callers (and the MCP server's error-translation layer) can branch on type.
// See CLAUDE.md decision 5.

/**
 * Shape of the JSON error body the API returns on non-2xx responses. The body
 * varies by origin: gateway errors use `message`; proxy/underlying-API errors
 * use `detail`; rate-limit responses carry `error` + `statusCode`. The HTTP
 * status line is the source of truth — `statusCode` only appears on rate limits.
 */
export interface VerifyaxErrorBody {
  error?: string;
  message?: string;
  detail?: string;
  statusCode?: number;
}

interface VerifyaxErrorOptions {
  statusCode?: number;
  responseBody?: unknown;
  cause?: unknown;
}

/** Base class for every error thrown by the SDK. */
export class VerifyaxError extends Error {
  /** HTTP status code, when the error originated from an HTTP response. */
  readonly statusCode: number | undefined;
  /** Parsed response body, when available. */
  readonly responseBody: unknown;

  constructor(message: string, options: VerifyaxErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'VerifyaxError';
    this.statusCode = options.statusCode;
    this.responseBody = options.responseBody;
    // Restore the prototype chain for `instanceof` after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401/403 — missing, malformed, revoked key, or resource in another workspace. */
export class AuthError extends VerifyaxError {
  constructor(message: string, options: VerifyaxErrorOptions = {}) {
    super(message, options);
    this.name = 'AuthError';
  }
}

/** 404 — resource not found. */
export class NotFoundError extends VerifyaxError {
  constructor(message: string, options: VerifyaxErrorOptions = {}) {
    super(message, options);
    this.name = 'NotFoundError';
  }
}

/** 409 — conflict, e.g. deleting a scenario that still has runs. */
export class ConflictError extends VerifyaxError {
  constructor(message: string, options: VerifyaxErrorOptions = {}) {
    super(message, options);
    this.name = 'ConflictError';
  }
}

/** 429 — rate limited. Carries `retryAfter` (seconds) when the header is present. */
export class RateLimitError extends VerifyaxError {
  readonly retryAfter: number | undefined;

  constructor(message: string, options: VerifyaxErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.name = 'RateLimitError';
    this.retryAfter = options.retryAfter;
  }
}

/** An async job reached a terminal FAILED or CANCELLED state. Carries `errorDetails`. */
export class JobFailedError extends VerifyaxError {
  readonly jobUuid: string;
  readonly jobStatus: string;
  readonly errorDetails: string | undefined;

  constructor(
    message: string,
    options: VerifyaxErrorOptions & {
      jobUuid: string;
      jobStatus: string;
      errorDetails?: string;
    }
  ) {
    super(message, options);
    this.name = 'JobFailedError';
    this.jobUuid = options.jobUuid;
    this.jobStatus = options.jobStatus;
    this.errorDetails = options.errorDetails;
  }
}

/** A polling loop or request exceeded its deadline before reaching a terminal state. */
export class TimeoutError extends VerifyaxError {
  readonly timeoutMs: number;

  constructor(message: string, options: VerifyaxErrorOptions & { timeoutMs: number }) {
    super(message, options);
    this.name = 'TimeoutError';
    this.timeoutMs = options.timeoutMs;
  }
}

/**
 * Map an HTTP response status + parsed body to the appropriate error class.
 * Used by the transport layer for every non-2xx response.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  retryAfter?: number
): VerifyaxError {
  const parsed = isErrorBody(body) ? body : undefined;
  // Only use string fields for the message — `detail` may be a structured value
  // (e.g. a 422 validation array); the full body is still on `responseBody`.
  const message =
    firstString(parsed?.message, parsed?.detail, parsed?.error) ??
    `Request failed with status ${String(status)}`;
  const options = { statusCode: status, responseBody: body };

  switch (status) {
    case 401:
    case 403:
      return new AuthError(message, options);
    case 404:
      return new NotFoundError(message, options);
    case 409:
      return new ConflictError(message, options);
    case 429:
      return new RateLimitError(
        message,
        retryAfter !== undefined ? { ...options, retryAfter } : options
      );
    default:
      return new VerifyaxError(message, options);
  }
}

function isErrorBody(body: unknown): body is VerifyaxErrorBody {
  return typeof body === 'object' && body !== null;
}

/** First argument that is a non-empty string, else undefined. */
function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}
