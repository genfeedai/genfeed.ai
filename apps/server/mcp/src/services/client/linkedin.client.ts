import type { BaseApiClient } from './base-api-client';

/** LinkedIn content generation, connection status, and analytics tools. */
export class LinkedInClient {
  constructor(private readonly base: BaseApiClient) {}

  generateLinkedInContent(params: {
    brandId?: string;
    topic: string;
    variationsCount?: number;
  }): Promise<
    Array<{
      body: string;
      content: string;
      cta: string;
      hashtags: string[];
      hook: string;
    }>
  > {
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
          response.data?.data?.map(
            (item: {
              attributes?: {
                body?: string;
                content?: string;
                cta?: string;
                hashtags?: string[];
                hook?: string;
              };
            }) => ({
              body: item.attributes?.body || '',
              content: item.attributes?.content || '',
              cta: item.attributes?.cta || '',
              hashtags: item.attributes?.hashtags || [],
              hook: item.attributes?.hook || '',
            }),
          ) || []
        );
      },
      this.base.failWith('Failed to generate LinkedIn content'),
    );
  }

  getLinkedInConnectionStatus(): Promise<{
    avatar: string | null;
    connected: boolean;
    handle: string | null;
    name: string | null;
    platform: string;
  }> {
    this.base.logger.debug('Getting LinkedIn connection status');

    return this.base.request(
      'getting LinkedIn connection status',
      async (http) => {
        const response = await http.get('/credentials/mentions');
        const mentions = response.data?.mentions || [];
        const linkedin = mentions.find(
          (m: { platform?: string }) => m.platform === 'linkedin',
        );

        if (linkedin) {
          return {
            avatar: linkedin.avatar || null,
            connected: true,
            handle: linkedin.handle || null,
            name: linkedin.name || null,
            platform: 'linkedin',
          };
        }

        return {
          avatar: null,
          connected: false,
          handle: null,
          name: null,
          platform: 'linkedin',
        };
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
