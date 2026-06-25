// Public entry point for @verifyax/sdk.

export const SDK_VERSION = '0.1.1';

export { VerifyaxClient } from './client.js';
export type {
  FetchLike,
  QueryParams,
  QueryValue,
  RequestOptions,
  VerifyaxClientOptions,
} from './client.js';

export {
  AuthError,
  ConflictError,
  JobFailedError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  VerifyaxError,
  errorFromResponse,
} from './errors.js';
export type { VerifyaxErrorBody } from './errors.js';

export { pollJob, pollUntilTerminal } from './polling.js';
export type { PollOptions } from './polling.js';

export type { ListAgentsParams } from './resources/agents.js';

export type * from './types.js';
