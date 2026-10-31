import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssetDeepLink from './asset-deep-link';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  assetId: 'asset-1' as string | null,
  brand: { brandId: 'brand-1', organizationId: 'org-1', isReady: true },
  findOne: vi.fn(),
  getService: vi.fn(),
  open: vi.fn(),
  pathname: '/org/brand/library/assets',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () =>
    new URLSearchParams(mocks.assetId ? { asset: mocks.assetId } : {}),
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));
vi.mock(
  '@/hooks/ui/ingredient/use-ingredient-sidebar/use-ingredient-sidebar',
  () => ({
    useIngredientSidebar: () => ({
      closeIngredientSidebar: vi.fn(),
      openIngredientSidebar: mocks.open,
    }),
  }),
);
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
    mocks.pathname = '/org/brand/library/assets';
    mocks.brand = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      isReady: true,
    };
    mocks.getService.mockResolvedValue({ findOne: mocks.findOne });
    mocks.findOne.mockResolvedValue(ingredient);
  });

  it('selects the exact asset into the sidebar in the current brand and aborts on unmount', async () => {
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

  it('opens an asset from any brand on the organization Library', async () => {
    mocks.pathname = '/org/~/library/assets';
    mocks.brand = { brandId: '', organizationId: 'org-1', isReady: true };
    mocks.findOne.mockResolvedValue({ ...ingredient, brandId: 'other-brand' });
    render(<AssetDeepLink />);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
  });

  it('still rejects another organization asset on the organization Library', async () => {
    mocks.pathname = '/org/~/library/assets';
    mocks.brand = { brandId: '', organizationId: 'org-1', isReady: true };
    mocks.findOne.mockResolvedValue({ ...ingredient, organizationId: 'other' });
    render(<AssetDeepLink />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mocks.open).not.toHaveBeenCalled();
  });

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

  it('retries a failed first lookup without flashing the unavailable error', async () => {
    mocks.findOne
      .mockRejectedValueOnce(new Error('Request failed with status code 404'))
      .mockResolvedValueOnce(ingredient);
    render(<AssetDeepLink />);
    await waitFor(() => expect(mocks.findOne).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith(ingredient), {
      timeout: 3000,
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports the asset unavailable only after every lookup attempt failed', async () => {
    mocks.findOne.mockRejectedValue(new Error('Request failed'));
    render(<AssetDeepLink />);
    expect(
      await screen.findByRole('alert', {}, { timeout: 3000 }),
    ).toHaveTextContent('This asset is unavailable');
    expect(mocks.findOne).toHaveBeenCalledTimes(3);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('waits for the brand scope instead of reporting the asset unavailable', async () => {
    mocks.brand = { brandId: '', organizationId: 'org-1', isReady: true };
    const { rerender } = render(<AssetDeepLink />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.findOne).not.toHaveBeenCalled();
    mocks.brand = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      isReady: true,
    };
    rerender(<AssetDeepLink />);
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(1));
  });

  it('rejects a malformed identifier even while brand context is not ready', async () => {
    mocks.brand.isReady = false;
    mocks.assetId = '../../users';
    render(<AssetDeepLink />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This asset is unavailable',
    );
    expect(mocks.getService).not.toHaveBeenCalled();
  });

  it('clears a stale error when the asset changes to a valid id before the scope is ready', async () => {
    mocks.assetId = '../../users';
    const { rerender } = render(<AssetDeepLink />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    mocks.brand.isReady = false;
    mocks.assetId = 'asset-1';
    rerender(<AssetDeepLink />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
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
