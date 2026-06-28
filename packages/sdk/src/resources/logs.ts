import type { VerifyaxClient } from '../client.js';
import type { ListLogsParams, LogEntry } from '../types.js';

/** Audit logs for the workspace. */
export class LogsResource {
  constructor(private readonly client: VerifyaxClient) {}

  /** List audit log entries. `from` and `to` (ISO 8601) are required together. */
  async list(params: ListLogsParams): Promise<LogEntry[]> {
    return this.client.request<LogEntry[]>('GET', '/logs', { query: params });
  }
}
