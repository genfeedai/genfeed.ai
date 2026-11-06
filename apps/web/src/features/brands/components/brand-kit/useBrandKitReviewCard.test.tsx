import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrandKitReviewCard } from './useBrandKitReviewCard';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  getClaimedBrandOsDraft: vi.fn(),
  loaded: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.error },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function draft(brandId: string, score: number): IBrandKitDraft {
  return {
    assetCandidates: [],
    brandId,
    diagnostics: [],
    evidence: [],
    fields: {},
    id: brandId,
    readiness: {
      diagnostics: [],
      missingFields: [],
      requiredFields: [],
      score,
      status: 'partial',
    },
    sourceType: 'website',
    status: 'partial',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const props = {
  brandId: 'brand-1',
  loadClaimedBrandOsDraft: true,
  onBrandOsDraftLoaded: mocks.loaded,
  onRefreshBrand: mocks.refresh,
};

describe('claimed Brand OS draft lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getService.mockResolvedValue({
      getClaimedBrandOsDraft: mocks.getClaimedBrandOsDraft,
    });
  });
  it('ignores a late handoff after unmount', async () => {
    const pending = deferred<{ draft: IBrandKitDraft }>();
    mocks.getClaimedBrandOsDraft.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useBrandKitReviewCard(props));
    await waitFor(() =>
      expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledOnce(),
    );
    unmount();
    await act(async () => {
      pending.resolve({ draft: draft('brand-1', 10) });
      await pending.promise;
    });
    expect(mocks.loaded).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it('does not replace the current brand with the previous brand’s late draft', async () => {
    const pending = deferred<{ draft: IBrandKitDraft }>();
    mocks.getClaimedBrandOsDraft.mockImplementation((brandId: string) =>
      brandId === 'brand-1'
        ? pending.promise
        : Promise.resolve({ draft: draft('brand-2', 80) }),
    );
    const { result, rerender } = renderHook(
      ({ brandId }) => useBrandKitReviewCard({ ...props, brandId }),
      { initialProps: { brandId: 'brand-1' } },
    );
    await waitFor(() =>
      expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledWith('brand-1'),
    );
    rerender({ brandId: 'brand-2' });
    await waitFor(() => expect(result.current.draft?.brandId).toBe('brand-2'));
    await act(async () => {
      pending.resolve({ draft: draft('brand-1', 10) });
      await pending.promise;
    });
    expect(result.current.draft?.brandId).toBe('brand-2');
    expect(mocks.loaded).toHaveBeenCalledOnce();
  });
  it('loads the current handoff once through Strict Mode cleanup and replay', async () => {
    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: draft('brand-1', 60),
    });
    const { result } = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: StrictMode,
    });
    await waitFor(() => expect(result.current.draft?.readiness.score).toBe(60));
    expect(mocks.loaded).toHaveBeenCalledOnce();
    expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledOnce();
  });
});
