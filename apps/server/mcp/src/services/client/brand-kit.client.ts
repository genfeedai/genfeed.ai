import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { BaseApiClient } from './base-api-client';
import type { ApiError } from './client.types';

const BRAND_KIT_SECTION_PATH = {
  visual_identity: 'visual-identity',
  writing_voice: 'writing-voice',
  strategy: 'strategy',
} as const;

export type BrandKitSection = keyof typeof BRAND_KIT_SECTION_PATH;

/**
 * The API refuses a Brand Kit write unless the connection holds the
 * `brand-kit:write` scope (or `brands:write`). That scope is issued only to a
 * connection limited to one selected brand, never to an all-organizations
 * connection, so the refusal names it and says how to get it.
 */
export const BRAND_KIT_EDIT_REFUSED_MESSAGE =
  'This connection cannot edit the Brand Kit. Editing needs the brand-kit:write scope, which Genfeed grants only to a connection limited to one selected brand, not to an all-organizations connection, whatever your role in the organization. Reconnect the Genfeed connector for this organization, choose the brand and allow Brand Kit editing, or edit the Brand Kit in the Genfeed web app.';

export class BrandKitClient {
  constructor(private readonly base: BaseApiClient) {}

  updateSection(
    brandId: string,
    section: BrandKitSection,
    fields: Record<string, unknown>,
  ): Promise<void> {
    return this.base.request(
      'saving Brand Kit section',
      async (http) => {
        await http.patch(
          `/brands/${encodeURIComponent(brandId)}/brand-kit/${BRAND_KIT_SECTION_PATH[section]}`,
          fields,
        );
      },
      (error: ApiError) => {
        const status = error.response?.status;
        if (status === 401 || status === 403) {
          throw new McpUpstreamError(BRAND_KIT_EDIT_REFUSED_MESSAGE, {
            status,
          });
        }
        return this.base.failWithDetail('Failed to save the Brand Kit section')(
          error,
        );
      },
    );
  }
}
