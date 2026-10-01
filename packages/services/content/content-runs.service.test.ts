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

  it('lists the brand storyboard runs as validated summaries', async () => {
    const controller = new AbortController();
    const summary = {
      brandId: 'brand-1',
      createdAt: '2026-08-20T10:00:00.000Z',
      id: 'run-remix-1',
      outputKind: 'video',
      phase: 'prefilled',
      runtimeSeconds: 12,
      shotCount: 2,
      sourceKind: 'remix_discovery',
      title: 'Proof-led TikTok hook',
      updatedAt: '2026-08-21T10:00:00.000Z',
    };
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockDeserializeCollection.mockReturnValue([summary]);

    const service = new ContentRunsService('token');
    const result = await service.listBrandRemixRuns(
      'brand-1',
      { limit: 50, page: 2 },
      controller.signal,
    );

    expect(mockGet).toHaveBeenCalledWith(
      '/brands/brand-1/content-runs/remixes',
      {
        params: { limit: 50, page: 2 },
        signal: controller.signal,
      },
    );
    expect(result).toEqual([summary]);
  });

  it('rejects a runs list row that does not match the summary contract', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockDeserializeCollection.mockReturnValue([
      { id: 'run-remix-1', sourceKind: 'remix' },
    ]);

    const service = new ContentRunsService('token');

    await expect(
      service.listBrandRemixRuns('brand-1', { limit: 50, page: 1 }),
    ).rejects.toThrow();
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

describe('ContentRunsService canonical storyboard drafts', () => {
  const run = {
    id: 'run-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    createdAt: '2026-09-30T12:00:00.000Z',
    updatedAt: '2026-09-30T12:00:00.000Z',
    config: {
      contract: 'storyboard-run',
      version: 1,
      revision: 1,
      clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
      createdByUserId: 'user-1',
      submittedInputHash: 'a'.repeat(64),
      state: 'storyboard',
      sourceSnapshot: {
        selector: { kind: 'brief', brief: '', seedImageAssetId: 'image-1' },
        capturedAt: '2026-09-30T12:00:00.000Z',
      },
      plan: {
        title: '',
        logline: '',
        videoModelKey: null,
        format: '9:16',
        runtimeBudgetSeconds: null,
        cast: [],
        styleReferenceAssetIds: [],
        shots: [],
      },
    },
  };
  beforeEach(() => {
    vi.clearAllMocks();
    const response = {
      data: {
        data: {
          id: run.id,
          type: 'storyboard-run',
          attributes: { config: run.config },
        },
      },
    };
    mockPost.mockResolvedValue(response);
    mockPatch.mockResolvedValue(response);
    mockGet.mockResolvedValue(response);
    mockDeserializeResource.mockReturnValue(run);
  });
  it('reads exact capabilities without JSON:API deserialization and rejects malformed timing data', async () => {
    const response = {
      version: 1,
      runId: 'run-1',
      runRevision: 1,
      capabilityVersion: 'a'.repeat(64),
      status: 'available',
      requestedModelKey: 'custom/video',
      reasonCode: null,
      eligibleModels: [],
      effectiveModel: {
        key: 'custom/video',
        label: 'Custom',
        provider: 'replicate',
        supportedDurationsSeconds: [4, 6],
        defaultDurationSeconds: 4,
        hasInterpolation: false,
        supportedFormats: ['9:16'],
        capabilitySource: 'catalog',
      },
    };
    mockGet.mockResolvedValue({ data: response });
    const service = new ContentRunsService('token');
    const signal = new AbortController().signal;
    expect(
      await service.getStoryboardRunCapabilities('brand-1', 'run-1', signal),
    ).toEqual(response);
    expect(mockGet).toHaveBeenCalledWith(
      '/brands/brand-1/storyboard-runs/run-1/capabilities',
      { signal },
    );
    expect(mockDeserializeResource).not.toHaveBeenCalled();
    mockGet.mockResolvedValue({
      data: {
        ...response,
        effectiveModel: {
          ...response.effectiveModel,
          supportedDurationsSeconds: [6, 4],
        },
      },
    });
    await expect(
      service.getStoryboardRunCapabilities('brand-1', 'run-1'),
    ).rejects.toThrow();
  });
  it('creates one explicit intent without adding settings or rewriting its UUID', async () => {
    const service = new ContentRunsService('token');
    const input = {
      clientRequestId: run.config.clientRequestId,
      source: {
        kind: 'brief' as const,
        brief: '',
        seedImageAssetId: 'image-1',
      },
    };
    expect(await service.createStoryboardRun('brand-1', input)).toMatchObject(
      run,
    );
    expect(mockPost).toHaveBeenCalledWith(
      '/brands/brand-1/storyboard-runs',
      input,
    );
  });
  it('uses brand-scoped CAS update and approval routes', async () => {
    const service = new ContentRunsService('token');
    await service.updateStoryboardPlan('brand-1', 'run-1', {
      expectedRevision: 1,
      plan: { ...run.config.plan, format: '9:16' },
    });
    expect(mockPatch).toHaveBeenCalledWith(
      '/brands/brand-1/storyboard-runs/run-1/plan',
      expect.objectContaining({ expectedRevision: 1 }),
      expect.objectContaining({
        handlesErrorResponse: expect.any(Function),
      }),
    );
    await service.approveStoryboardPlan('brand-1', 'run-1', {
      expectedRevision: 1,
    });
    expect(mockPost).toHaveBeenCalledWith(
      '/brands/brand-1/storyboard-runs/run-1/plan/approve',
      { expectedRevision: 1 },
    );
  });
  it('passes cancellation signal through a scoped read and rejects malformed server config', async () => {
    const service = new ContentRunsService('token');
    const signal = new AbortController().signal;
    await service.getStoryboardRun('brand-1', 'run-1', signal);
    expect(mockGet).toHaveBeenCalledWith(
      '/brands/brand-1/storyboard-runs/run-1',
      { signal },
    );
    mockGet.mockResolvedValue({
      data: {
        data: {
          id: run.id,
          type: 'storyboard-run',
          attributes: {
            config: { ...run.config, contract: 'brand-remix-run' },
          },
        },
      },
    });
    await expect(
      service.getStoryboardRun('brand-1', 'run-1'),
    ).rejects.toThrow();
  });
});
