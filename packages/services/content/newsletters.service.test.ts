import type { NewsletterSerializer } from '@genfeedai/client/serializers';
import { Newsletter } from '@models/content/newsletter.model';
import { NewslettersService } from '@services/content/newsletters.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInstance = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock('@services/core/base.service', () => {
  class MockBaseService {
    public baseURL: string;
    public instance = mockInstance;

    constructor(
      endpoint: string,
      _token: string,
      _ModelClass: typeof Newsletter,
      _Serializer: typeof NewsletterSerializer,
    ) {
      this.baseURL = endpoint;
    }

    static getDataServiceInstance(
      ServiceClass: new (token: string) => unknown,
      token: string,
    ) {
      return new ServiceClass(token);
    }

    public patch = vi.fn();

    protected async mapOne(
      data: { data?: unknown } | unknown,
    ): Promise<Newsletter> {
      return new Newsletter(
        (data as { data?: Newsletter }).data ?? (data as Newsletter),
      );
    }
  }

  return {
    BaseService: MockBaseService,
    JsonApiResponseDocument: {},
  };
});

describe('NewslettersService', () => {
  let service: NewslettersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NewslettersService('test-token');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a newsletter through the publish endpoint', async () => {
    mockInstance.post.mockResolvedValue({
      data: {
        data: {
          content: '# Issue',
          id: 'newsletter-1',
          label: 'Issue 1',
          status: 'published',
          topic: 'Launch update',
        },
      },
    });

    const result = await service.publish('newsletter-1');

    expect(mockInstance.post).toHaveBeenCalledWith('newsletter-1/publish', {});
    expect(result).toBeInstanceOf(Newsletter);
    expect(result.status).toBe('published');
  });

  it('loads the expanded context payload for a newsletter', async () => {
    mockInstance.get.mockResolvedValue({
      data: {
        data: {
          brandVoice: { tone: 'direct' },
          contextSources: [{ label: 'Saved context', summary: 'Summary' }],
          recentNewsletters: [],
          selectedContext: [],
          selectedContextIds: [],
          sourceRefs: [],
          status: 'ready_for_review',
          summary: 'Summary',
          topic: 'Topic',
          updatedAt: '2026-03-10T12:00:00.000Z',
        },
      },
    });

    const result = await service.getContext('newsletter-1');

    expect(mockInstance.get).toHaveBeenCalledWith('newsletter-1/context');
    expect(result.topic).toBe('Topic');
    expect(result.status).toBe('ready_for_review');
  });
});
