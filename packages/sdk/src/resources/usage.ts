import type { VerifyaxClient } from '../client.js';
import type {
  ListUsageCallsParams,
  ListUsageEventsParams,
  UsageCall,
  UsageEvent,
} from '../types.js';

/** Usage & spend events and per-call detail. */
export class UsageResource {
  constructor(private readonly client: VerifyaxClient) {}

  async listEvents(params: ListUsageEventsParams = {}): Promise<UsageEvent[]> {
    return this.client.request<UsageEvent[]>('GET', '/usage/events', { query: params });
  }

  async getEvent(eventId: string): Promise<UsageEvent> {
    return this.client.request<UsageEvent>('GET', `/usage/events/${eventId}`);
  }

  async listCalls(params: ListUsageCallsParams = {}): Promise<UsageCall[]> {
    return this.client.request<UsageCall[]>('GET', '/usage/calls', { query: params });
  }
}
