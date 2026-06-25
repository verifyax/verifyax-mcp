import type { VerifyaxClient } from '@verifyax/sdk';
import type { Logger } from '../logging.js';

/** Shared dependencies passed to every tool handler. */
export interface ToolContext {
  client: VerifyaxClient;
  logger: Logger;
}
