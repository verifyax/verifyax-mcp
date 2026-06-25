import type { VerifyaxClient } from '../client.js';
import type { Tag, TagsResponse } from '../types.js';

/**
 * Skill-tag catalogue. Served from the `/web/api/v1` base (not `/api/v1`) and
 * requires no auth. The response is a `{ success, data }` envelope, unlike every
 * other list endpoint — this resource unwraps it and returns the `data` array.
 */
export class TagsResource {
  constructor(private readonly client: VerifyaxClient) {}

  async list(): Promise<Tag[]> {
    const response = await this.client.request<TagsResponse>('GET', '/tags', {
      base: 'web',
      auth: false,
    });
    return response.data;
  }
}
