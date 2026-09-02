import { InstagramInspirationService } from '@api/services/instagram-inspiration/instagram-inspiration.service';
import type { InstagramInspirationBrandContext } from '@genfeedai/interfaces';

const brand: InstagramInspirationBrandContext = {
  audience: ['founders'],
  hashtags: ['creatorops'],
  id: 'brand-1',
  label: 'Genfeed',
  messagingPillars: [],
  organizationId: 'org-1',
  topics: ['AI creators'],
};

describe('InstagramInspirationService', () => {
  const apifyService = {
    getInstagramUserPosts: vi.fn(),
    searchInstagramByHashtag: vi.fn(),
  };
  const cacheService = {
    generateKey: vi.fn(
      (namespace: string, kind: string, fingerprint: string) =>
        `${namespace}:${kind}:${fingerprint}`,
    ),
    get: vi.fn(),
    set: vi.fn(),
  };
  const workflowsService = {
    createWorkflow: vi.fn(),
  };
  const loggerService = {
    log: vi.fn(),
  };
  let service: InstagramInspirationService;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheService.get.mockResolvedValue(null);
    cacheService.set.mockResolvedValue(true);
    apifyService.searchInstagramByHashtag.mockResolvedValue([]);
    apifyService.getInstagramUserPosts.mockResolvedValue([]);
    service = new InstagramInspirationService(
      apifyService as never,
      cacheService as never,
      workflowsService as never,
      loggerService as never,
    );
  });

  it('uses an opaque cache key derived from organization and brand scope', async () => {
    await service.listInstagramInspiration({ brand, hashtags: ['creatorops'] });

    expect(cacheService.generateKey).toHaveBeenCalledWith(
      'instagram-inspiration',
      'list',
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(cacheService.get).toHaveBeenCalledWith(
      expect.stringContaining('instagram-inspiration:list:'),
    );
  });

  it('uses different cache keys for different organization and brand scopes', async () => {
    await service.listInstagramInspiration({
      brand,
      hashtags: ['creatorops'],
    });
    await service.listInstagramInspiration({
      brand: { ...brand, id: 'brand-2', organizationId: 'org-2' },
      hashtags: ['creatorops'],
    });

    const keys = cacheService.get.mock.calls.map(([key]) => key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('returns a degraded empty result instead of consulting the global trend corpus', async () => {
    const result = await service.listInstagramInspiration({
      brand,
      hashtags: ['creatorops'],
    });

    expect(result).toMatchObject({
      accounts: [],
      degraded: true,
      source: 'live',
    });
    expect(cacheService.set).not.toHaveBeenCalled();
  });

  it('returns successful candidates with degraded status after a partial provider failure', async () => {
    apifyService.searchInstagramByHashtag
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce([
        {
          caption: 'A practical creator workflow',
          id: 'post-1',
          ownerUsername: 'peer',
          shortCode: 'ABC123',
          timestamp: '2026-07-21T12:00:00.000Z',
          videoUrl: 'https://cdn.example.com/reel.mp4',
        },
      ]);

    const result = await service.listInstagramInspiration({
      brand,
      hashtags: ['creatorops', 'aicreators'],
    });

    expect(result.degraded).toBe(true);
    expect(result.accounts).toEqual([
      expect.objectContaining({ username: 'peer' }),
    ]);
  });

  it('serves organization-keyed cached detail without calling the provider', async () => {
    cacheService.get.mockResolvedValue({
      degraded: false,
      posts: [],
      signals: { formats: [], hooks: [], pacing: [], styles: [] },
      source: 'live',
      username: 'peer',
    });

    const result = await service.getInstagramInspirationDetail({
      brand,
      username: 'peer',
    });

    expect(result.source).toBe('cache');
    expect(apifyService.getInstagramUserPosts).not.toHaveBeenCalled();
  });

  it('creates only a draft review workflow with provenance', async () => {
    apifyService.getInstagramUserPosts.mockResolvedValue([
      {
        caption: 'How to build better creator systems?',
        id: 'post-1',
        ownerUsername: 'peer',
        shortCode: 'ABC123',
        timestamp: '2026-07-21T12:00:00.000Z',
        videoUrl: 'https://cdn.example.com/reel.mp4',
      },
    ]);
    workflowsService.createWorkflow.mockResolvedValue({
      id: 'workflow-1',
      label: 'Genfeed Instagram Remix',
    });

    const result = await service.createInstagramRemixWorkflow({
      brand,
      shortcode: 'ABC123',
      userId: 'user-1',
      username: 'peer',
    });

    expect(workflowsService.createWorkflow).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      expect.objectContaining({
        brandId: 'brand-1',
        status: 'draft',
        templateId: 'instagram-remix-review',
      }),
    );
    expect(result).toMatchObject({
      reviewRequired: true,
      source: { ownerUsername: 'peer', shortcode: 'ABC123' },
      status: 'draft',
      workflowId: 'workflow-1',
    });
  });
});
