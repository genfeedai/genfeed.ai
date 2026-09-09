import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssetDeepLink from './asset-deep-link';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  assetId: 'asset-1' as string | null,
  brand: { brandId: 'brand-1', organizationId: 'org-1', isReady: true },
  findOne: vi.fn(),
  getService: vi.fn(),
  open: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () =>
    new URLSearchParams(mocks.assetId ? { asset: mocks.assetId } : {}),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));
vi.mock('@contexts/providers/global-modals/global-modals.provider', () => ({
  useIngredientOverlay: () => ({ openIngredientOverlay: mocks.open }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

const ingredient = {
  id: 'asset-1',
  brandId: 'brand-1',
  organizationId: 'org-1',
  isDeleted: false,
};

describe('AssetDeepLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assetId = 'asset-1';
    mocks.brand = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      isReady: true,
    };
    mocks.getService.mockResolvedValue({ findOne: mocks.findOne });
    mocks.findOne.mockResolvedValue(ingredient);
  });

  it('opens the exact asset in the current brand and aborts on unmount', async () => {
    const { unmount } = render(<AssetDeepLink />);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(ingredient));
    expect(mocks.findOne).toHaveBeenCalledWith(
      'asset-1',
      {},
      expect.any(AbortSignal),
    );
    const signal = mocks.findOne.mock.calls[0][2];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it.each([
    { ...ingredient, brandId: 'other-brand' },
    { ...ingredient, organizationId: 'other-org' },
    { ...ingredient, isDeleted: true },
    { ...ingredient, id: 'other-asset' },
  ])(
    'does not open a deleted, mismatched, or out-of-scope asset: %j',
    async (record) => {
      mocks.findOne.mockResolvedValue(record);
      render(<AssetDeepLink />);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This asset is unavailable',
      );
      expect(mocks.open).not.toHaveBeenCalled();
    },
  );

  it('does not fetch until brand context is ready', async () => {
    mocks.brand.isReady = false;
    const { rerender } = render(<AssetDeepLink />);
    expect(mocks.findOne).not.toHaveBeenCalled();
    mocks.brand.isReady = true;
    rerender(<AssetDeepLink />);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
  });

  it('ignores stale responses after the requested asset changes', async () => {
    let complete: (record: typeof ingredient) => void = () => undefined;
    mocks.findOne.mockReturnValueOnce(
      new Promise<typeof ingredient>((resolve) => {
        complete = resolve;
      }),
    );
    const { rerender } = render(<AssetDeepLink />);
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    mocks.assetId = null;
    rerender(<AssetDeepLink />);
    complete(ingredient);
    await waitFor(() =>
      expect(mocks.findOne.mock.calls[0][2].aborted).toBe(true),
    );
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('does nothing without an asset query and rejects malformed identifiers locally', async () => {
    mocks.assetId = null;
    const { rerender } = render(<AssetDeepLink />);
    expect(mocks.getService).not.toHaveBeenCalled();
    mocks.assetId = '../../users';
    rerender(<AssetDeepLink />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This asset is unavailable',
    );
    expect(mocks.getService).not.toHaveBeenCalled();
  });
});
