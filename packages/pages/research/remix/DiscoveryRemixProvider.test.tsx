import { ContentRunStatus } from '@genfeedai/contracts';
import type {
  BrandRemixRunView,
  BrandRemixSourceSelector,
} from '@genfeedai/contracts/api-types/contracts';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  brandId: { value: 'brand-1' },
  createBrandRemixRun: vi.fn(),
  push: vi.fn(),
  reviseBrandRemixRun: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => mocks.brandId.value,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    createBrandRemixRun: mocks.createBrandRemixRun,
    reviseBrandRemixRun: mocks.reviseBrandRemixRun,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    activeHref: (path: string) => `/acme/northstar${path}`,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

import {
  DiscoveryRemixProvider,
  useDiscoveryRemix,
} from './DiscoveryRemixProvider';

const source: BrandRemixSourceSelector = {
  kind: 'trend_reference',
  sourceReferenceId: 'source-reference-1',
  trendId: 'trend-1',
};

const run: BrandRemixRunView = {
  brand: { contextMode: 'brand', id: 'brand-1', name: 'Northstar' },
  brandId: 'brand-1',
  contract: 'brand-remix-run',
  createdAt: '2026-08-20T10:00:00.000Z',
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Remix the proof-led hook.' },
    output: { aspectRatio: '9:16', count: 3, kind: 'video' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
  id: 'run-1',
  phase: 'prefilled',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: '2026-08-20T10:00:00.000Z',
    evidence: ['Proof lands before the product reveal.'],
    metrics: { views: 123000 },
    pattern: { hook: 'Proof before promise' },
    platform: 'tiktok',
    selector: source,
    sourceId: 'source-reference-1',
    title: 'Proof-led hook',
  },
  status: ContentRunStatus.PENDING,
  updatedAt: '2026-08-20T10:00:00.000Z',
  version: 1,
};

function wrapper({ children }: { readonly children: ReactNode }) {
  return <DiscoveryRemixProvider>{children}</DiscoveryRemixProvider>;
}

describe('DiscoveryRemixProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.brandId.value = 'brand-1';
    mocks.createBrandRemixRun.mockResolvedValue(run);
    mocks.reviseBrandRemixRun.mockResolvedValue({ ...run, revision: 2 });
  });

  it('hydrates a server-owned brief from a typed source selector', async () => {
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    await act(async () => {
      await result.current.openRemix(source);
    });

    expect(mocks.createBrandRemixRun).toHaveBeenCalledWith('brand-1', {
      source,
    });
    expect(result.current.run?.sourceSnapshot.pattern.hook).toBe(
      'Proof before promise',
    );
    expect(result.current.status).toBe('ready');
  });

  it('deduplicates rapid preparation requests for the same source selector', async () => {
    let resolvePreparation: ((value: BrandRemixRunView) => void) | undefined;
    mocks.createBrandRemixRun.mockReturnValueOnce(
      new Promise<BrandRemixRunView>((resolve) => {
        resolvePreparation = resolve;
      }),
    );
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    let firstRequest: Promise<void> | undefined;
    let secondRequest: Promise<void> | undefined;
    act(() => {
      firstRequest = result.current.openRemix(source);
      secondRequest = result.current.openRemix(source);
    });
    expect(mocks.createBrandRemixRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePreparation?.(run);
      await Promise.all([firstRequest, secondRequest]);
    });
    expect(result.current.run?.id).toBe('run-1');
  });

  it('persists reviewed edits before navigating with only the opaque run id', async () => {
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    await act(async () => {
      await result.current.openRemix(source);
    });
    await act(async () => {
      await result.current.confirm({
        intent: { objective: 'Keep the proof and sharpen the product reveal.' },
      });
    });

    expect(mocks.reviseBrandRemixRun).toHaveBeenCalledWith('run-1', {
      edits: {
        intent: {
          objective: 'Keep the proof and sharpen the product reveal.',
        },
      },
      expectedRevision: 1,
    });
    expect(mocks.push).toHaveBeenCalledWith(
      '/acme/northstar/studio/generate?run=run-1',
    );
  });

  it('reports a save-specific fallback when a revision save has no JSON:API detail', async () => {
    mocks.reviseBrandRemixRun.mockRejectedValueOnce({ status: 409 });
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    await act(async () => {
      await result.current.openRemix(source);
    });
    await act(async () => {
      await result.current.confirm({
        intent: { objective: 'Keep the proof and sharpen the product reveal.' },
      });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(
      'The on-brand remix brief could not be saved.',
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('keeps a failed preparation visible and retryable without navigating', async () => {
    mocks.createBrandRemixRun.mockRejectedValueOnce(
      new Error('Source is no longer available'),
    );
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    await act(async () => {
      await result.current.openRemix(source);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Source is no longer available');
    expect(mocks.push).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.run?.id).toBe('run-1');
  });

  it('surfaces actionable JSON:API authorization details from service failures', async () => {
    mocks.createBrandRemixRun.mockRejectedValueOnce({
      errors: [
        {
          detail: 'Reconnect the source account before preparing this remix.',
          title: 'Source is unauthorized',
        },
      ],
    });
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    await act(async () => {
      await result.current.openRemix(source);
    });

    expect(result.current.error).toBe(
      'Reconnect the source account before preparing this remix.',
    );
  });

  it('keeps refreshed blocking issues in the inspector instead of navigating', async () => {
    mocks.reviseBrandRemixRun.mockResolvedValueOnce({
      ...run,
      readiness: {
        issues: [
          {
            code: 'missing_avatar',
            field: 'avatarAssetId',
            message: 'Choose an avatar and paired voice.',
            severity: 'blocked',
          },
        ],
        state: 'blocked',
      },
      revision: 2,
    });
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });

    await act(async () => {
      await result.current.openRemix(source);
    });
    await act(async () => {
      await result.current.confirm({
        output: { kind: 'avatar' },
      });
    });

    expect(result.current.run?.readiness.state).toBe('blocked');
    expect(result.current.status).toBe('ready');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('allows preparation after a brand becomes available', async () => {
    mocks.brandId.value = '';
    const { rerender, result } = renderHook(() => useDiscoveryRemix(), {
      wrapper,
    });

    await act(async () => {
      await result.current.openRemix(source);
    });
    expect(mocks.createBrandRemixRun).not.toHaveBeenCalled();

    mocks.brandId.value = 'brand-1';
    rerender();
    await act(async () => {
      await result.current.openRemix(source);
    });
    expect(mocks.createBrandRemixRun).toHaveBeenCalledTimes(1);
  });

  it('does not navigate when the inspector is closed while a revision saves', async () => {
    let resolveRevision: ((value: BrandRemixRunView) => void) | undefined;
    mocks.reviseBrandRemixRun.mockReturnValueOnce(
      new Promise<BrandRemixRunView>((resolve) => {
        resolveRevision = resolve;
      }),
    );
    const { result } = renderHook(() => useDiscoveryRemix(), { wrapper });
    await act(async () => {
      await result.current.openRemix(source);
    });

    let saveRequest: Promise<void> | undefined;
    act(() => {
      saveRequest = result.current.confirm({
        intent: { objective: 'Revised objective' },
      });
      result.current.close();
    });
    await act(async () => {
      resolveRevision?.({ ...run, revision: 2 });
      await saveRequest;
    });

    expect(mocks.push).not.toHaveBeenCalled();
    expect(result.current.run).toBeNull();
    expect(result.current.status).toBe('idle');
  });
});
