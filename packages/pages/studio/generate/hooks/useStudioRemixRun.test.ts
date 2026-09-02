import { ContentRunStatus } from '@genfeedai/contracts';
import type {
  BrandRemixDraftEdits,
  BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createBrandRemixRun: vi.fn(),
  findBrandRemixRun: vi.fn(),
  prepareBrandRemixPausedDraft: vi.fn(),
  replace: vi.fn(),
  reviseBrandRemixRun: vi.fn(),
  startBrandRemixRun: vi.fn(),
  submitBrandRemixRunForReview: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams('run=run-1'),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    activeHref: (path: string) => `/acme/northstar${path}`,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createBrandRemixRun: mocks.createBrandRemixRun,
    findBrandRemixRun: mocks.findBrandRemixRun,
    prepareBrandRemixPausedDraft: mocks.prepareBrandRemixPausedDraft,
    reviseBrandRemixRun: mocks.reviseBrandRemixRun,
    startBrandRemixRun: mocks.startBrandRemixRun,
    submitBrandRemixRunForReview: mocks.submitBrandRemixRunForReview,
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: true,
    subscribe: mocks.subscribe,
  }),
}));

import { useStudioRemixRun } from './useStudioRemixRun';

const run: BrandRemixRunView = {
  brand: { contextMode: 'brand', id: 'brand-1', name: 'Northstar' },
  brandId: 'brand-1',
  contract: 'brand-remix-run',
  createdAt: '2026-08-20T10:00:00.000Z',
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Remix the proof-led hook.' },
    output: {
      aspectRatio: '9:16',
      count: 2,
      durationSeconds: 8,
      kind: 'video',
    },
    references: [
      {
        assetId: 'reference-1',
        role: 'style',
        source: 'brand_default',
      },
    ],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
  execution: {
    actualCount: 0,
    generationBrief: {
      constraints: [],
      fidelityMode: 'guided',
      intent: {
        objective: 'Remix the proof-led hook.',
        requestedText: [],
        subjects: [],
      },
      mediaKind: 'video',
      output: { aspectRatio: '9:16', durationSeconds: 8 },
      provenance: [],
      references: [{ assetId: 'reference-1', role: 'style' }],
      version: 1,
    },
    requestedCount: 2,
    variants: [
      {
        assetIds: ['video-1'],
        id: 'variant-1',
        recipeRevision: 1,
        status: 'processing',
      },
    ],
  },
  id: 'run-1',
  phase: 'generating',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: '2026-08-20T10:00:00.000Z',
    evidence: ['Proof lands before the reveal.'],
    metrics: { views: 123000 },
    pattern: { hook: 'Proof before promise' },
    platform: 'tiktok',
    selector: {
      kind: 'trend_reference',
      sourceReferenceId: 'reference-1',
      trendId: 'trend-1',
    },
    sourceId: 'reference-1',
    title: 'Proof-led hook',
  },
  status: ContentRunStatus.RUNNING,
  updatedAt: '2026-08-20T10:00:00.000Z',
  version: 1,
};

describe('useStudioRemixRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findBrandRemixRun.mockResolvedValue(run);
    mocks.reviseBrandRemixRun.mockResolvedValue({ ...run, revision: 2 });
    mocks.startBrandRemixRun.mockResolvedValue(run);
    mocks.createBrandRemixRun.mockResolvedValue({
      ...run,
      id: 'run-variation-1',
      phase: 'prefilled',
    });
    mocks.submitBrandRemixRunForReview.mockResolvedValue({
      ...run,
      phase: 'in_review',
    });
    mocks.prepareBrandRemixPausedDraft.mockResolvedValue({
      ...run,
      phase: 'paid_draft_ready',
    });
    mocks.subscribe.mockReturnValue(mocks.unsubscribe);
  });

  it('restores the durable run and resubscribes its in-flight assets', async () => {
    const { result } = renderHook(() => useStudioRemixRun());

    await waitFor(() => expect(result.current.run?.id).toBe('run-1'));

    expect(mocks.findBrandRemixRun).toHaveBeenCalledWith(
      'run-1',
      expect.any(AbortSignal),
    );
    expect(mocks.subscribe).toHaveBeenCalledWith(
      '/videos/video-1',
      expect.any(Function),
    );
  });

  it('surfaces actionable JSON:API stale-run details', async () => {
    mocks.findBrandRemixRun.mockRejectedValueOnce({
      errors: [
        {
          detail: 'Reload this remix before changing the recipe.',
          title: 'Stale remix revision',
        },
      ],
    });
    const { result } = renderHook(() => useStudioRemixRun());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'Reload this remix before changing the recipe.',
    );
  });

  it('persists Studio edits before starting the returned revision', async () => {
    const { result } = renderHook(() => useStudioRemixRun());
    await waitFor(() => expect(result.current.run?.id).toBe('run-1'));
    const edits: BrandRemixDraftEdits = {
      intent: { objective: 'Sharpen the benefit reveal.' },
      references: [{ assetId: 'reference-1', role: 'style' }],
    };

    await act(async () => {
      await result.current.start(edits);
    });

    expect(mocks.reviseBrandRemixRun).toHaveBeenCalledWith('run-1', {
      edits,
      expectedRevision: 1,
    });
    expect(mocks.startBrandRemixRun).toHaveBeenCalledWith('run-1', {
      expectedRevision: 2,
    });
  });

  it('creates a durable sibling recipe when varying a completed run', async () => {
    const { result } = renderHook(() => useStudioRemixRun());
    await waitFor(() => expect(result.current.run?.id).toBe('run-1'));

    await act(async () => {
      await result.current.vary();
    });

    expect(mocks.createBrandRemixRun).toHaveBeenCalledWith(
      'brand-1',
      expect.objectContaining({
        edits: expect.objectContaining({ references: [] }),
        source: run.sourceSnapshot.selector,
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      '/acme/northstar/studio/generate?run=run-variation-1',
    );
  });

  it('submits ready variants to the shared Review queue', async () => {
    const { result } = renderHook(() => useStudioRemixRun());
    await waitFor(() => expect(result.current.run?.id).toBe('run-1'));

    await act(async () => {
      await result.current.submitForReview(['variant-1']);
    });

    expect(mocks.submitBrandRemixRunForReview).toHaveBeenCalledWith('run-1', {
      variantIds: ['variant-1'],
    });
  });
});
