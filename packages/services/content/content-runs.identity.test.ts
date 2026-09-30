import { ContentRunsService } from '@services/content/content-runs.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.genfeed.ai/v1' },
}));
vi.mock('@services/core/interceptor.service', () => ({
  HTTPBaseService: class {
    protected instance = http;
  },
}));

function document(organizationId = 'org-1') {
  const ids = ['coffee-shot-1', 'coffee_shot_1'];
  const plan = {
    title: '',
    logline: '',
    videoModelKey: null,
    format: '9:16' as const,
    runtimeBudgetSeconds: 8,
    cast: [],
    styleReferenceAssetIds: [],
    shots: ids.map((id, index) => ({
      id,
      ordinal: index + 1,
      action: 'Action',
      durationSeconds: 4,
      stillFreshness: 'fresh' as const,
      stillAssetId: `image-${index}`,
      onScreenSpeaker: false,
      transition: 'cut' as const,
    })),
  };
  return {
    data: {
      type: 'storyboard-run',
      id: `run-${organizationId}`,
      attributes: {
        organization_id: organizationId,
        brand_id: 'brand-1',
        created_at: '2026-09-30T12:00:00.000Z',
        updated_at: '2026-09-30T12:00:00.000Z',
        config: {
          contract: 'storyboard-run',
          version: 1,
          revision: 1,
          clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
          createdByUserId: 'user-1',
          submittedInputHash: 'a'.repeat(64),
          state: 'ready',
          sourceSnapshot: {
            selector: { kind: 'brief' as const, brief: 'Product' },
            capturedAt: '2026-09-30T12:00:00.000Z',
          },
          plan,
          scenePipeline: {
            version: 1,
            language: 'en',
            state: 'ready',
            cancellationGeneration: 0,
            replacedAssetIds: [],
            receipts: [],
            scenes: Object.fromEntries(
              ids.map((id, index) => [
                id,
                {
                  identity: {
                    avatarAssetId: 'avatar-1',
                    speechVoiceId: 'voice-1',
                  },
                  referenceAssetIds: [],
                  image: {
                    attempt: 1,
                    state: 'ready',
                    assetId: `image-${index}`,
                  },
                  video: {
                    attempt: 1,
                    state: 'ready',
                    assetId: `video-${organizationId}-${index}`,
                  },
                  replacedAssetIds: [],
                },
              ]),
            ),
          },
        },
      },
    },
  };
}
describe('ContentRunsService with real response deserialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const response = { data: document() };
    http.get.mockResolvedValue(response);
    http.post.mockResolvedValue(response);
    http.patch.mockResolvedValue(response);
  });
  it('protects config in every full Storyboard response method', async () => {
    const service = new ContentRunsService('token');
    const fixture = document();
    const input = { expectedRevision: 1 };
    const results = await Promise.all([
      service.getStoryboardRun('brand-1', 'run-org-1'),
      service.createStoryboardRun('brand-1', {
        clientRequestId: fixture.data.attributes.config.clientRequestId,
        source: fixture.data.attributes.config.sourceSnapshot.selector,
      }),
      service.updateStoryboardPlan('brand-1', 'run-org-1', {
        ...input,
        plan: fixture.data.attributes.config.plan,
      }),
      service.resetStoryboardPlan('brand-1', 'run-org-1', input),
      service.executeStoryboardRun('brand-1', 'run-org-1', {
        ...input,
        quoteId: 'quote:original',
      }),
      service.cancelStoryboardRun('brand-1', 'run-org-1', {
        ...input,
        operationId: 'operation:original',
      }),
      service.resumeStoryboardRun('brand-1', 'run-org-1', {
        ...input,
        operationId: 'operation:original',
      }),
      service.approveStoryboardPlan('brand-1', 'run-org-1', input),
      service.updateStoryboardSource('brand-1', 'run-org-1', {
        ...input,
        source: fixture.data.attributes.config.sourceSnapshot.selector,
      }),
    ]);
    for (const run of results)
      expect(
        run.config.plan?.shots.map(
          (shot) => run.config.scenePipeline?.scenes[shot.id].video.assetId,
        ),
      ).toEqual(['video-org-1-0', 'video-org-1-1']);
  });
  it('does not cache colliding record keys across responses and retains scoped URLs and abort signals', async () => {
    http.get
      .mockResolvedValueOnce({ data: document('org-1') })
      .mockResolvedValueOnce({ data: document('org-2') });
    const signal = new AbortController().signal;
    const service = new ContentRunsService('token');
    const first = await service.getStoryboardRun(
      'brand-A',
      'run-org-1',
      signal,
    );
    const second = await service.getStoryboardRun('brand-B', 'run-org-2');
    expect(
      first.config.scenePipeline?.scenes['coffee-shot-1'].video.assetId,
    ).toBe('video-org-1-0');
    expect(
      second.config.scenePipeline?.scenes['coffee-shot-1'].video.assetId,
    ).toBe('video-org-2-0');
    expect(http.get).toHaveBeenNthCalledWith(
      1,
      '/brands/brand-A/storyboard-runs/run-org-1',
      { signal },
    );
    expect(http.get).toHaveBeenNthCalledWith(
      2,
      '/brands/brand-B/storyboard-runs/run-org-2',
      { signal: undefined },
    );
  });
  it('validates raw bounded quote responses and preserves scoped accepted identities', async () => {
    const service = new ContentRunsService('token');
    const quote = {
      id: 'quote:Mixed',
      revision: 1,
      operation: 'video',
      inputHash: 'hash:Mixed',
      capabilityVersion: 'a'.repeat(64),
      maximumShotCount: null,
      amountKind: 'exact',
      createdAt: '2026-09-30T12:00:00.000Z',
      expiresAt: '2026-09-30T12:15:00.000Z',
      total: 2,
      items: [
        {
          key: 'line:Coffee-shot_1',
          shotId: 'coffee-shot_1',
          slotOrdinal: null,
          stage: 'video',
          model: 'provider/model',
          credits: 2,
          billingMode: 'platform',
          attempt: 1,
        },
      ],
    };
    const input = { expectedRevision: 1, operation: 'video' as const };
    http.post.mockResolvedValueOnce({ data: quote });
    expect(await service.quoteStoryboardRun('brand:A', 'run:A', input)).toEqual(
      quote,
    );
    expect(http.post).toHaveBeenCalledWith(
      '/brands/brand%3AA/storyboard-runs/run%3AA/quotes',
      input,
    );
    http.post.mockResolvedValueOnce({
      data: { ...quote, privateSnapshot: { tariff: 1 } },
    });
    await expect(
      service.quoteStoryboardRun('brand:A', 'run:A', input),
    ).rejects.toThrow();
    for (const [suffix, payload] of [
      ['execute', { expectedRevision: 1, quoteId: 'quote:original' }],
      ['cancel', { expectedRevision: 1, operationId: 'operation:original' }],
      ['resume', { expectedRevision: 1, operationId: 'operation:original' }],
    ] as const) {
      if (suffix === 'execute')
        await service.executeStoryboardRun(
          'brand:A',
          'run:A',
          payload as { expectedRevision: number; quoteId: string },
        );
      else if (suffix === 'cancel')
        await service.cancelStoryboardRun(
          'brand:A',
          'run:A',
          payload as { expectedRevision: number; operationId: string },
        );
      else
        await service.resumeStoryboardRun(
          'brand:A',
          'run:A',
          payload as { expectedRevision: number; operationId: string },
        );
      expect(http.post).toHaveBeenCalledWith(
        `/brands/brand%3AA/storyboard-runs/run%3AA/${suffix}`,
        payload,
      );
    }
  });
});
