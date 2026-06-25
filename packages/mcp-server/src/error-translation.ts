// Translates the SDK's typed errors into structured MCP tool errors
// (CLAUDE.md decision 6). Tool handlers catch and return these — raw exceptions
// must never escape into MCP output.

import {
  AuthError,
  ConflictError,
  JobFailedError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  VerifyaxError,
} from '@verifyax/sdk';

export interface ToolError {
  success: false;
  reason: string;
  suggested_fix?: string;
}

export function translateError(error: unknown): ToolError {
  if (error instanceof AuthError) {
    return {
      success: false,
      reason: `Authentication failed: ${error.message}`,
      suggested_fix:
        'Check that VERIFYAX_API_KEY is a valid, active API key for this workspace, then restart the MCP server.',
    };
  }
  if (error instanceof NotFoundError) {
    return {
      success: false,
      reason: `Not found: ${error.message}`,
      suggested_fix: 'Verify the uuid — list the resources first to find the correct one.',
    };
  }
  if (error instanceof ConflictError) {
    return {
      success: false,
      reason: `Conflict: ${error.message}`,
      suggested_fix:
        'The resource is still referenced by others (e.g. a scenario with runs). Remove the dependents first.',
    };
  }
  if (error instanceof RateLimitError) {
    const wait =
      error.retryAfter !== undefined ? `${String(error.retryAfter)} seconds` : 'a short while';
    return {
      success: false,
      reason: `Rate limited: ${error.message}`,
      suggested_fix: `Wait ${wait} and try again.`,
    };
  }
  if (error instanceof JobFailedError) {
    return {
      success: false,
      reason: `The operation did not complete (${error.jobStatus}): ${error.errorDetails ?? error.message}`,
      suggested_fix:
        'Review the failure details above and adjust the request (for scenario generation, re-check the tag names and scenario-type compatibility).',
    };
  }
  if (error instanceof TimeoutError) {
    return {
      success: false,
      reason: `Timed out after ${String(error.timeoutMs)}ms: ${error.message}`,
      suggested_fix: 'The operation is taking longer than expected. Try again shortly.',
    };
  }
  if (error instanceof VerifyaxError) {
    return { success: false, reason: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, reason: `Unexpected error: ${message}` };
}
