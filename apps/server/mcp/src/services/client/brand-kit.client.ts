import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import type { BaseApiClient } from './base-api-client';
import type { ApiError } from './client.types';

const BRAND_KIT_SECTION_PATH = {
  identity: 'identity',
  visual_identity: 'visual-identity',
  writing_voice: 'writing-voice',
  strategy: 'strategy',
} as const;

export type BrandKitSection = keyof typeof BRAND_KIT_SECTION_PATH;

/** What an owner reviews before the draft Brand Kit revision is approved. */
export interface BrandKitApprovalDraft {
  description?: string;
  name?: string;
  needsWebReview: boolean;
  revisionId: string;
  updatedAt: string;
  version: number;
}

interface ApprovalDraftResource {
  attributes?: {
    content?: {
      fields?: Record<string, { currentValue?: unknown } | undefined>;
      generationRules?: unknown;
    };
    updatedAt?: string;
    version?: number;
  };
  id?: string;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

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
      this.refusal('Failed to save the Brand Kit section'),
    );
  }

  /** The draft revision waiting for approval, as the owner will see it. */
  getApprovalDraft(brandId: string): Promise<BrandKitApprovalDraft> {
    return this.base.request(
      'reading the Brand Kit draft',
      async (http) => {
        const resource = this.base.unwrapData<ApprovalDraftResource>(
          await http.get(
            `/brands/${encodeURIComponent(brandId)}/brand-kit/approval`,
          ),
        );
        const content = resource.attributes?.content;
        return {
          description: textValue(content?.fields?.description?.currentValue),
          name: textValue(content?.fields?.label?.currentValue),
          needsWebReview: content?.generationRules !== undefined,
          revisionId: resource.id ?? '',
          updatedAt: resource.attributes?.updatedAt ?? '',
          version: resource.attributes?.version ?? 0,
        };
      },
      this.refusal('Failed to read the Brand Kit draft'),
    );
  }

  /** Approves the draft the owner reviewed; the API refuses a draft that changed since. */
  approveDraft(
    brandId: string,
    draft: Pick<BrandKitApprovalDraft, 'revisionId' | 'updatedAt'>,
  ): Promise<void> {
    return this.base.request(
      'approving the Brand Kit',
      async (http) => {
        await http.post(
          `/brands/${encodeURIComponent(brandId)}/brand-kit/approve`,
          draft,
        );
      },
      this.refusal('Failed to approve the Brand Kit'),
    );
  }

  private refusal(failure: string) {
    return (error: ApiError) => {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        throw new McpUpstreamError(BRAND_KIT_EDIT_REFUSED_MESSAGE, { status });
      }
      return this.base.failWithDetail(failure)(error);
    };
  }
}
