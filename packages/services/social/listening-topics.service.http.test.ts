import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { ListeningTopicsService } from '@services/social/listening-topics.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ListeningTopicsService social intelligence HTTP contract', () => {
  let http: MockHttpInstance;
  let service: ListeningTopicsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ListeningTopicsService('token');
    http = installMockHttp(service);
  });

  it('loads topics, themes, signals, and evidence inside one org and brand', async () => {
    http.get
      .mockResolvedValueOnce(
        axiosResponse(
          collectionDocument(
            [
              {
                brandId: 'brand-1',
                id: 'topic-1',
                label: 'AI agents',
                organizationId: 'org-1',
                sources: [],
              },
            ],
            { pagination: { limit: 100, page: 1, pages: 1, total: 1 } },
          ),
        ),
      )
      .mockResolvedValueOnce(
        axiosResponse(
          collectionDocument([{ evidenceIds: ['evidence-1'], id: 'theme-1' }]),
        ),
      )
      .mockResolvedValueOnce(
        axiosResponse(
          collectionDocument([{ id: 'signal-1', status: 'sufficient' }]),
        ),
      )
      .mockResolvedValueOnce(
        axiosResponse(
          collectionDocument([
            {
              contentExcerpt: 'Evidence line',
              id: 'evidence-1',
              sourceUrl: 'https://example.com/evidence',
            },
          ]),
        ),
      );

    const result = await service.getSocialIntelligenceInbox({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(http.get).toHaveBeenNthCalledWith(1, '', {
      params: {
        brandId: 'brand-1',
        isActive: true,
        limit: 100,
        organizationId: 'org-1',
        page: 1,
      },
      signal: undefined,
    });
    expect(http.get).toHaveBeenCalledWith('/topic-1/themes', {
      params: {
        brandId: 'brand-1',
        limit: 100,
        organizationId: 'org-1',
        page: 1,
      },
      signal: undefined,
    });
    expect(http.get).toHaveBeenCalledWith('/topic-1/signals', {
      params: {
        brandId: 'brand-1',
        limit: 100,
        organizationId: 'org-1',
        page: 1,
      },
      signal: undefined,
    });
    expect(http.get).toHaveBeenCalledWith('/topic-1/evidence', {
      params: {
        brandId: 'brand-1',
        limit: 100,
        organizationId: 'org-1',
        page: 1,
      },
      signal: undefined,
    });
    expect(result[0]).toMatchObject({
      evidence: [expect.objectContaining({ id: 'evidence-1' })],
      signals: [expect.objectContaining({ id: 'signal-1' })],
      themes: [expect.objectContaining({ id: 'theme-1' })],
      topic: expect.objectContaining({ id: 'topic-1' }),
    });
  });

  it('reviews a theme with a tenant-scoped PATCH', async () => {
    http.patch.mockResolvedValue(
      axiosResponse(
        resourceDocument(
          {
            evidenceIds: ['evidence-1'],
            reviewState: 'deferred',
            reviewedBy: 'user-1',
          },
          { id: 'theme-1', type: 'listening-theme' },
        ),
      ),
    );

    const result = await service.reviewTheme('topic-1', 'theme-1', 'deferred', {
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(http.patch).toHaveBeenCalledWith(
      '/topic-1/themes/theme-1/review',
      { state: 'deferred' },
      { params: { brandId: 'brand-1', organizationId: 'org-1' } },
    );
    expect(result).toMatchObject({
      evidenceIds: ['evidence-1'],
      id: 'theme-1',
      reviewState: 'deferred',
    });
  });
});
