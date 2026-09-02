import { ContentRunStatus } from '@genfeedai/contracts';
import type {
  BrandRemixRunView,
  BrandRemixSourceSelector,
} from '@genfeedai/contracts/api-types/contracts';
import { ContentRunsService } from '@services/content/content-runs.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDeserializeCollection,
  mockDeserializeResource,
  mockGet,
  mockPatch,
  mockPost,
} = vi.hoisted(() => ({
  mockDeserializeCollection: vi.fn(),
  mockDeserializeResource: vi.fn(),
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@services/core/json-api', () => ({
  deserializeCollection: mockDeserializeCollection,
  deserializeResource: mockDeserializeResource,
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    protected instance = {
      get: mockGet,
      patch: mockPatch,
      post: mockPost,
    };

    constructor(
      protected readonly baseURL: string,
      protected readonly token: string,
    ) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

describe('ContentRunsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts research brief handoffs to the brand content-runs endpoint', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: {
            brief: {
              evidence: ['Source text'],
              sourceUrl: 'https://x.com/builderx/status/1',
            },
            skillSlug: 'trend-remix',
            status: 'pending',
          },
          id: 'run-1',
          type: 'content-runs',
        },
      },
    });
    mockDeserializeResource.mockReturnValue({
      _id: 'run-1',
      brief: {
        evidence: ['Source text'],
        sourceUrl: 'https://x.com/builderx/status/1',
      },
      skillSlug: 'trend-remix',
      status: 'pending',
    });

    const service = new ContentRunsService('token');
    const result = await service.createResearchBriefRun('brand-1', {
      evidence: ['Source text'],
      platform: 'twitter',
      sourceUrl: 'https://x.com/builderx/status/1',
      trendId: 'trend-1',
      trendTopic: '#AIAgents',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/brands/brand-1/content-runs/briefs',
      {
        evidence: ['Source text'],
        platform: 'twitter',
        sourceUrl: 'https://x.com/builderx/status/1',
        trendId: 'trend-1',
        trendTopic: '#AIAgents',
      },
    );
    expect(result).toMatchObject({
      _id: 'run-1',
      brief: {
        evidence: ['Source text'],
        sourceUrl: 'https://x.com/builderx/status/1',
      },
    });
  });

  it('lists brand content runs without filter params by default', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockDeserializeCollection.mockReturnValue([]);

    const service = new ContentRunsService('token');
    const result = await service.list('brand-1');

    expect(mockGet).toHaveBeenCalledWith('/brands/brand-1/content-runs', {
      params: {},
    });
    expect(result).toEqual([]);
  });

  it('forwards status and skillSlug filters when listing brand content runs', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            attributes: { skillSlug: 'trend-remix', status: 'completed' },
            id: 'run-1',
            type: 'content-runs',
          },
        ],
      },
    });
    mockDeserializeCollection.mockReturnValue([
      { _id: 'run-1', skillSlug: 'trend-remix', status: 'completed' },
    ]);

    const service = new ContentRunsService('token');
    const result = await service.list('brand-1', {
      skillSlug: 'trend-remix',
      status: ContentRunStatus.COMPLETED,
    });

    expect(mockGet).toHaveBeenCalledWith('/brands/brand-1/content-runs', {
      params: { skillSlug: 'trend-remix', status: 'completed' },
    });
    expect(result).toEqual([
      { _id: 'run-1', skillSlug: 'trend-remix', status: 'completed' },
    ]);
  });

  it('fetches a single content run by id', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          attributes: { status: 'completed' },
          id: 'run-1',
          type: 'content-runs',
        },
      },
    });
    mockDeserializeResource.mockReturnValue({
      _id: 'run-1',
      status: 'completed',
    });

    const service = new ContentRunsService('token');
    const result = await service.findOne('run-1');

    expect(mockGet).toHaveBeenCalledWith('/content-runs/run-1');
    expect(result).toMatchObject({ _id: 'run-1', status: 'completed' });
  });

  it('requests run-level recommendation analysis', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: {
            analyticsSummary: { winningVariantId: 'variant-a' },
          },
          id: 'run-1',
          type: 'content-runs',
        },
      },
    });
    mockDeserializeResource.mockReturnValue({
      _id: 'run-1',
      analyticsSummary: { winningVariantId: 'variant-a' },
    });

    const service = new ContentRunsService('token');
    const result = await service.analyzeRecommendations('run-1');

    expect(mockPost).toHaveBeenCalledWith(
      '/content-runs/run-1/recommendations',
    );
    expect(result).toMatchObject({
      _id: 'run-1',
      analyticsSummary: { winningVariantId: 'variant-a' },
    });
  });

  it('requests remix pack generation for a content run', async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          attributes: {
            variants: [{ id: 'post-thread', metadata: {}, type: 'text' }],
          },
          id: 'run-1',
          type: 'content-runs',
        },
      },
    });
    mockDeserializeResource.mockReturnValue({
      _id: 'run-1',
      variants: [{ id: 'post-thread', metadata: {}, type: 'text' }],
    });

    const service = new ContentRunsService('token');
    const result = await service.createRemixPack('run-1');

    expect(mockPost).toHaveBeenCalledWith('/content-runs/run-1/remix-pack');
    expect(result).toMatchObject({
      _id: 'run-1',
      variants: [{ id: 'post-thread', metadata: {}, type: 'text' }],
    });
  });

  const remixSource: BrandRemixSourceSelector = {
    kind: 'trend_reference',
    sourceReferenceId: 'source-reference-1',
    trendId: 'trend-1',
  };

  const remixRun: BrandRemixRunView = {
    brand: {
      contextMode: 'brand',
      id: 'brand-1',
      name: 'Northstar',
    },
    brandId: 'brand-1',
    contract: 'brand-remix-run',
    createdAt: '2026-08-20T10:00:00.000Z',
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: {
        objective: 'Remix the proof-led hook for TikTok.',
      },
      output: {
        aspectRatio: '9:16',
        count: 3,
        kind: 'video',
      },
      references: [],
      reviewRequired: true,
      target: {
        kind: 'organic',
        platform: 'tiktok',
      },
    },
    id: 'run-remix-1',
    phase: 'prefilled',
    readiness: {
      issues: [],
      state: 'ready',
    },
    recipeVersion: 1,
    revision: 1,
    sourceSnapshot: {
      capturedAt: '2026-08-20T10:00:00.000Z',
      evidence: ['The first three seconds lead with proof.'],
      metrics: { views: 120000 },
      pattern: { hook: 'Proof before promise' },
      platform: 'tiktok',
      selector: remixSource,
      sourceId: 'source-reference-1',
      title: 'Proof-led TikTok hook',
    },
    status: 'pending',
    updatedAt: '2026-08-20T10:00:00.000Z',
    version: 1,
  };

  it('creates a server-prefilled brand remix run from only a typed source selector', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockDeserializeResource.mockReturnValue(remixRun);

    const service = new ContentRunsService('token');
    const result = await service.createBrandRemixRun('brand-1', {
      source: remixSource,
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/brands/brand-1/content-runs/remixes',
      { source: remixSource },
    );
    expect(result).toEqual(remixRun);
  });

  it('reads the hydrated remix recipe through the run-scoped endpoint', async () => {
    mockGet.mockResolvedValue({ data: { data: {} } });
    mockDeserializeResource.mockReturnValue(remixRun);

    const service = new ContentRunsService('token');
    const result = await service.findBrandRemixRun('run-remix-1');

    expect(mockGet).toHaveBeenCalledWith('/content-runs/run-remix-1/remix', {
      signal: undefined,
    });
    expect(result.sourceSnapshot.pattern.hook).toBe('Proof before promise');
  });

  it('revises a remix run with optimistic concurrency', async () => {
    mockPatch.mockResolvedValue({ data: { data: {} } });
    mockDeserializeResource.mockReturnValue({ ...remixRun, revision: 2 });

    const service = new ContentRunsService('token');
    const result = await service.reviseBrandRemixRun('run-remix-1', {
      edits: {
        intent: { objective: 'Keep the proof, sharpen the offer.' },
      },
      expectedRevision: 1,
    });

    expect(mockPatch).toHaveBeenCalledWith('/content-runs/run-remix-1/remix', {
      edits: {
        intent: { objective: 'Keep the proof, sharpen the offer.' },
      },
      expectedRevision: 1,
    });
    expect(result.revision).toBe(2);
  });

  it('starts a version-pinned remix generation', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockDeserializeResource.mockReturnValue({
      ...remixRun,
      phase: 'generating',
    });

    const service = new ContentRunsService('token');
    const result = await service.startBrandRemixRun('run-remix-1', {
      expectedRevision: 1,
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/content-runs/run-remix-1/remix/start',
      { expectedRevision: 1 },
    );
    expect(result.phase).toBe('generating');
  });

  it('submits selected run variants to review', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockDeserializeResource.mockReturnValue({
      ...remixRun,
      phase: 'in_review',
    });

    const service = new ContentRunsService('token');
    await service.submitBrandRemixRunForReview('run-remix-1', {
      variantIds: ['variant-1'],
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/content-runs/run-remix-1/remix/review',
      { variantIds: ['variant-1'] },
    );
  });

  it('prepares a paused Meta campaign draft from an approved variant', async () => {
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockDeserializeResource.mockReturnValue({
      ...remixRun,
      phase: 'paid_draft_ready',
    });

    const service = new ContentRunsService('token');
    await service.prepareBrandRemixPausedDraft('run-remix-1', {
      destination: {
        adAccountId: 'account-1',
        credentialId: 'credential-1',
      },
      variantId: 'variant-1',
    });

    expect(mockPost).toHaveBeenCalledWith(
      '/content-runs/run-remix-1/remix/paid-draft',
      {
        destination: {
          adAccountId: 'account-1',
          credentialId: 'credential-1',
        },
        variantId: 'variant-1',
      },
    );
  });
});
