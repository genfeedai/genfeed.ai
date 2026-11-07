import type { BaseApiClient } from './base-api-client';

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** The preset catalog the caller can read: platform defaults plus their own. */
export class PresetsClient {
  constructor(private readonly base: BaseApiClient) {}

  /** Every page, so a key is never reported missing because it sat on page two. */
  listPresets(): Promise<unknown[]> {
    return this.base.request(
      'listing presets',
      async (http) => {
        const presets: unknown[] = [];
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const response = await http.get('/presets', {
            params: { isActive: true, limit: PAGE_SIZE, page },
          });
          const rows = this.base.unwrapList<unknown>(response);
          presets.push(...rows);
          if (rows.length < PAGE_SIZE) break;
        }
        return presets;
      },
      this.base.failWith('Failed to list presets'),
    );
  }
}
