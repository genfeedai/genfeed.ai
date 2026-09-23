import { Platform } from '@genfeedai/contracts';
import type { BaseApiClient } from './base-api-client';
import type {
  LinkedInAccountIdentity,
  LinkedInConnectionStatus,
  LinkedInContentAttributes,
  LinkedInContentItem,
} from './linkedin.client.types';

const LINKEDIN_CREDENTIAL_PAGE_SIZE = 100;

const DISCONNECTED_CREDENTIAL_REASON =
  'A LinkedIn credential exists but is not marked connected. Publishing readiness only includes credentials marked connected, and mentions only include connected accounts that have a public handle.';

/** LinkedIn content generation, connection status, and analytics tools. */
export class LinkedInClient {
  constructor(private readonly base: BaseApiClient) {}

  generateLinkedInContent(params: {
    brandId?: string;
    topic: string;
    variationsCount?: number;
  }): Promise<LinkedInContentItem[]> {
    this.base.logger.debug('Generating LinkedIn content', { params });

    return this.base.request(
      'generating LinkedIn content',
      async (http) => {
        const response = await http.post('/content-intelligence/generate', {
          brandId: params.brandId,
          platform: 'linkedin',
          topic: params.topic,
          variationsCount: params.variationsCount || 3,
        });

        return (
          response.data?.data?.map((item: LinkedInContentAttributes) => ({
            body: item.attributes?.body || '',
            content: item.attributes?.content || '',
            cta: item.attributes?.cta || '',
            hashtags: item.attributes?.hashtags || [],
            hook: item.attributes?.hook || '',
          })) || []
        );
      },
      this.base.failWith('Failed to generate LinkedIn content'),
    );
  }

  getLinkedInConnectionStatus(): Promise<LinkedInConnectionStatus> {
    this.base.logger.debug('Getting LinkedIn connection status');

    return this.base.request(
      'getting LinkedIn connection status',
      async (http) => {
        const mentionsResponse = await http.get('/credentials/mentions');
        const mentions = asRecordList(mentionsResponse.data?.mentions);
        const linkedinMention = mentions.find((mention) =>
          isLinkedInPlatform(mention.platform),
        );

        if (linkedinMention) {
          return toConnectionStatus(readMentionIdentity(linkedinMention), true);
        }

        // Mentions omit credentials that have no externalHandle. Publishing
        // readiness still treats a connected LinkedIn credential as
        // publish-capable, so the credential list is the source of presence.
        const credentialsResponse = await http.get('/credentials', {
          params: { limit: LINKEDIN_CREDENTIAL_PAGE_SIZE },
        });
        const credential = findLinkedInCredential(
          this.base.unwrapList(credentialsResponse),
        );

        if (credential) {
          return toConnectionStatus(
            credential,
            credential.isConnected !== false,
            credential.isConnected === false
              ? DISCONNECTED_CREDENTIAL_REASON
              : undefined,
          );
        }

        return toConnectionStatus(
          { avatar: null, handle: null, name: null },
          false,
        );
      },
      this.base.failWith('Failed to get LinkedIn connection status'),
    );
  }

  getLinkedInAnalytics(
    contentId: string,
    timeRange: string = '7d',
  ): Promise<Record<string, unknown>> {
    this.base.logger.debug('Getting LinkedIn analytics', {
      contentId,
      timeRange,
    });

    return this.base.request(
      'getting LinkedIn analytics',
      async (http) => {
        const response = await http.get(`/content-performance/${contentId}`, {
          params: {
            platform: 'linkedin',
            timeRange,
          },
        });

        return this.base.unwrapAttributes(response);
      },
      this.base.failWith('Failed to get LinkedIn analytics'),
    );
  }
}

function toConnectionStatus(
  identity: LinkedInAccountIdentity,
  connected: boolean,
  reason?: string,
): LinkedInConnectionStatus {
  const status: LinkedInConnectionStatus = {
    avatar: identity.avatar,
    connected,
    handle: identity.handle,
    name: identity.name,
    platform: Platform.LINKEDIN,
  };

  if (reason) {
    status.reason = reason;
  }

  return status;
}

function readMentionIdentity(
  mention: Record<string, unknown>,
): LinkedInAccountIdentity {
  return {
    avatar: readPublicText(mention.avatar),
    handle: readPublicText(mention.handle),
    name: readPublicText(mention.name),
  };
}

function findLinkedInCredential(
  resources: unknown,
): LinkedInAccountIdentity | undefined {
  const matches = asRecordList(resources)
    .map(readCredentialIdentity)
    .filter(
      (identity): identity is LinkedInAccountIdentity => identity !== undefined,
    );

  return (
    matches.find((identity) => identity.isConnected !== false) ?? matches[0]
  );
}

function readCredentialIdentity(
  resource: Record<string, unknown>,
): LinkedInAccountIdentity | undefined {
  const attributes = isRecord(resource.attributes)
    ? resource.attributes
    : resource;
  if (!isLinkedInPlatform(attributes.platform ?? resource.platform)) {
    return undefined;
  }

  const isConnected = attributes.isConnected;

  return {
    avatar:
      readPublicText(attributes.externalAvatar) ??
      readPublicText(attributes.avatar),
    handle:
      readPublicText(attributes.externalHandle) ??
      readPublicText(attributes.handle),
    isConnected: typeof isConnected === 'boolean' ? isConnected : undefined,
    name:
      readPublicText(attributes.externalName) ??
      readPublicText(attributes.name) ??
      readPublicText(attributes.label),
  };
}

function isLinkedInPlatform(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase() === Platform.LINKEDIN;
}

function readPublicText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 200 ||
    /bearer\s+|access[_-]?token|refresh[_-]?token|eyJ[A-Za-z0-9_-]{8,}\./i.test(
      trimmed,
    )
  ) {
    return null;
  }

  return trimmed;
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
