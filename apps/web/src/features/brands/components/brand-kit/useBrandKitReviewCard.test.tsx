import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBrandKitReviewCard } from './useBrandKitReviewCard';

const mocks = vi.hoisted(() => ({
  applyBrandKitDraft: vi.fn(),
  getService: vi.fn(),
  getClaimedBrandOsDraft: vi.fn(),
  loaded: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
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
/** Strict Mode around a fresh query cache. */
function StrictQueryWrapper({ children }: { children: ReactNode }) {
  const [QueryWrapper] = useState(() => queryClientWrapper());
  return (
    <StrictMode>
      <QueryWrapper>{children}</QueryWrapper>
    </StrictMode>
  );
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
      applyBrandKitDraft: mocks.applyBrandKitDraft,
      getClaimedBrandOsDraft: mocks.getClaimedBrandOsDraft,
    });
  });
  it('ignores a late handoff after unmount', async () => {
    const pending = deferred<{ draft: IBrandKitDraft }>();
    mocks.getClaimedBrandOsDraft.mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(),
    });
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
      { initialProps: { brandId: 'brand-1' }, wrapper: queryClientWrapper() },
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
      wrapper: StrictQueryWrapper,
    });
    await waitFor(() => expect(result.current.draft?.readiness.score).toBe(60));
    expect(mocks.loaded).toHaveBeenCalledOnce();
    expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledOnce();
  });
  it('paints the cached handoff at once when Brand Kit is reopened', async () => {
    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: draft('brand-1', 60),
    });
    const client = createTestQueryClient();
    const firstVisit = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(firstVisit.result.current.draft?.readiness.score).toBe(60),
    );
    firstVisit.unmount();

    mocks.getClaimedBrandOsDraft.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.draft?.readiness.score).toBe(60);
    expect(result.current.isBrandOsDraft).toBe(true);
  });
  it('keeps the review the user started when a background refresh lands', async () => {
    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: draft('brand-1', 60),
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(result.current.draft?.readiness.score).toBe(60));
    act(() => result.current.handleToggleCandidate('logo-1'));

    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: draft('brand-1', 80),
    });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['brand-os-claimed-draft'] });
    });

    await waitFor(() =>
      expect(result.current.selectedCandidateIds.has('logo-1')).toBe(true),
    );
    expect(result.current.draft?.readiness.score).toBe(60);
  });
  it('keeps the draft being applied when a background refresh lands mid-apply', async () => {
    const applicable: IBrandKitDraft = {
      ...draft('brand-1', 60),
      fields: {
        description: {
          applyActionDefault: 'preserve',
          currentValue: 'Old description',
          diagnostics: [],
          evidence: [],
          group: 'profile',
          key: 'description',
          label: 'Description',
          ownerPath: 'brand.description',
          proposedValue: 'New description',
        },
      },
    } as IBrandKitDraft;
    mocks.getClaimedBrandOsDraft.mockResolvedValue({ draft: applicable });
    mocks.applyBrandKitDraft.mockReturnValue(new Promise(() => {}));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(result.current.draft?.readiness.score).toBe(60));

    act(() => {
      void result.current.handleApplyKeys(['description']);
    });
    await waitFor(() => expect(result.current.isApplying).toBe(true));
    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: draft('brand-1', 80),
    });
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['brand-os-claimed-draft'] });
      // React Query hands the refreshed read to observers on the next tick.
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(result.current.draft?.readiness.score).toBe(60);
    expect(result.current.draft?.fields.description?.proposedValue).toBe(
      'New description',
    );
  });
  it('shows no draft and does not throw when the handoff has no draft', async () => {
    mocks.getClaimedBrandOsDraft.mockResolvedValue({});
    const { result } = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() =>
      expect(mocks.getClaimedBrandOsDraft).toHaveBeenCalledOnce(),
    );
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });

    expect(result.current.draft).toBeNull();
  });
  it('never shows one brand’s cached handoff for another brand', async () => {
    mocks.getClaimedBrandOsDraft.mockResolvedValue({
      draft: draft('brand-1', 60),
    });
    const client = createTestQueryClient();
    const firstVisit = renderHook(() => useBrandKitReviewCard(props), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(firstVisit.result.current.draft?.brandId).toBe('brand-1'),
    );
    firstVisit.unmount();

    mocks.getClaimedBrandOsDraft.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(
      () => useBrandKitReviewCard({ ...props, brandId: 'brand-2' }),
      { wrapper: queryClientWrapper(client) },
    );

    expect(result.current.draft).toBeNull();
  });
});
