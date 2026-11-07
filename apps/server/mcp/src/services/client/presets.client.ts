import type { BaseApiClient } from './base-api-client';

/** The preset catalog the caller can read: platform defaults plus their own. */
export class PresetsClient {
  constructor(private readonly base: BaseApiClient) {}

  listPresets(): Promise<unknown[]> {
    return this.base.request(
      'listing presets',
      async (http) => {
        const response = await http.get('/presets', {
          params: { isActive: true, limit: 100, page: 1 },
        });
        return this.base.unwrapList<unknown>(response);
      },
      this.base.failWith('Failed to list presets'),
    );
  }
}
