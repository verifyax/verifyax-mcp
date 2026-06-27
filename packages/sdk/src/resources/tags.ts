import type { VerifyaxClient } from '../client.js';
import type { Tag } from '../types.js';

/**
 * Skill-tag catalogue. Served from the authed `/api/v1` base and returned as a
 * bare JSON array (global catalogue merged with the org's custom overlay; org
 * tags have `custom: true`).
 */
export class TagsResource {
  constructor(private readonly client: VerifyaxClient) {}

  async list(): Promise<Tag[]> {
    return this.client.request<Tag[]>('GET', '/tags');
  }
}
