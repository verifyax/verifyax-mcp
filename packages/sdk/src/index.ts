// Public entry point for @verifyax/sdk.

export { VERSION as SDK_VERSION } from './version.js';

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
