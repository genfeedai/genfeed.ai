import { AssetCategory, AssetScope } from '@genfeedai/enums';
import type { IBrand } from '@genfeedai/interfaces';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindOne = vi.fn();
const mockPatch = vi.fn();
const mockGetService = vi.fn();
const mockCopyToClipboard = vi.fn();
const mockOpenUpload = vi.fn();
const mockNotifyError = vi.fn();
const mockFindPublicArticles = vi.fn();
const mockFindPublicImages = vi.fn();
const mockFindPublicVideos = vi.fn();
const mockSubscribe = vi.fn(() => vi.fn());

const mockPublicService = {
  findPublicArticles: mockFindPublicArticles,
  findPublicImages: mockFindPublicImages,
  findPublicVideos: mockFindPublicVideos,
};

const mockClipboardService = {
  copyToClipboard: mockCopyToClipboard,
};

const mockNotificationsService = {
  error: mockNotifyError,
  success: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ orgSlug: 'acme', slug: 'brand-1' })),
  usePathname: vi.fn(() => '/settings/brands/brand-1'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brands: [],
  })),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    subscribe: mockSubscribe,
  })),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: vi.fn(() => ({
    imageModels: [],
  })),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmModal: vi.fn(() => ({ openConfirm: vi.fn() })),
    useUploadModal: vi.fn(() => ({ openUpload: mockOpenUpload })),
  }),
);

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@genfeedai/services/external/public.service', () => ({
  PublicService: {
    getInstance: vi.fn(() => mockPublicService),
  },
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: vi.fn(() => mockClipboardService),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => mockNotificationsService),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';

describe('useBrandDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCopyToClipboard.mockResolvedValue(undefined);
    mockFindPublicArticles.mockResolvedValue([]);
    mockFindPublicImages.mockResolvedValue([]);
    mockFindPublicVideos.mockResolvedValue([]);
    mockFindOne.mockResolvedValue({
      id: 'brand-1',
      links: [],
      scope: AssetScope.BRAND,
    } as IBrand);
    mockPatch.mockResolvedValue({
      id: 'brand-1',
      links: [],
      scope: AssetScope.PUBLIC,
    } as IBrand);
    mockGetService.mockResolvedValue({
      delete: vi.fn(),
      findOneBySlug: mockFindOne,
      patch: mockPatch,
    });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetService,
    );
  });

  it('derives brand id from params and loads brand data', async () => {
    const { result } = renderHook(() => useBrandDetail());

    await waitFor(() => {
      expect(result.current.brand).not.toBeNull();
    });

    expect(result.current.brandId).toBe('brand-1');
    expect(result.current.hasBrandId).toBe(true);
    expect(mockFindOne).toHaveBeenCalledWith('brand-1');
  });

  it('uses article-native public query params for latest articles', async () => {
    renderHook(() => useBrandDetail());

    await waitFor(() => {
      expect(mockFindPublicArticles).toHaveBeenCalledWith({
        brand: 'brand-1',
        limit: 3,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        status: ['public'],
      });
    });
  });

  it('copies text via clipboard service', async () => {
    const { result } = renderHook(() => useBrandDetail());

    await result.current.handleCopy('copy-me');

    expect(mockCopyToClipboard).toHaveBeenCalledWith('copy-me');
  });

  it('opens upload modal with brand details', async () => {
    const { result } = renderHook(() => useBrandDetail());

    await waitFor(() => {
      expect(result.current.brand).not.toBeNull();
    });

    act(() => {
      result.current.handleOpenUploadModal(AssetCategory.LOGO);
    });

    expect(mockOpenUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        category: AssetCategory.LOGO,
        parentId: 'brand-1',
        parentModel: 'Brand',
      }),
    );
  });

  describe('handleUpdateAccount scope toggle', () => {
    async function renderLoadedBrand() {
      const { result } = renderHook(() => useBrandDetail());

      await waitFor(() => {
        expect(result.current.brand).not.toBeNull();
      });

      return result;
    }

    it('flips the scope optimistically before the patch resolves', async () => {
      let resolvePatch: ((brand: IBrand) => void) | undefined;
      mockPatch.mockImplementationOnce(
        () =>
          new Promise<IBrand>((resolve) => {
            resolvePatch = resolve;
          }),
      );

      const result = await renderLoadedBrand();

      act(() => {
        void result.current.handleUpdateAccount('scope', AssetScope.PUBLIC);
      });

      await waitFor(() => {
        expect(result.current.brand?.scope).toBe(AssetScope.PUBLIC);
      });
      expect(result.current.isUpdating).toBe(true);

      await act(async () => {
        resolvePatch?.({
          id: 'brand-1',
          links: [],
          scope: AssetScope.PUBLIC,
        } as IBrand);
      });

      expect(result.current.isUpdating).toBe(false);
    });

    it('persists the public scope when the toggle is switched on', async () => {
      const result = await renderLoadedBrand();

      await act(async () => {
        await result.current.handleUpdateAccount('scope', AssetScope.PUBLIC);
      });

      expect(mockPatch).toHaveBeenCalledWith('brand-1', {
        scope: AssetScope.PUBLIC,
      });
      expect(result.current.brand?.scope).toBe(AssetScope.PUBLIC);
      expect(mockNotifyError).not.toHaveBeenCalled();
    });

    it('persists the brand scope when the toggle is switched back off', async () => {
      mockFindOne.mockResolvedValue({
        id: 'brand-1',
        links: [],
        scope: AssetScope.PUBLIC,
      } as IBrand);
      mockPatch.mockResolvedValue({
        id: 'brand-1',
        links: [],
        scope: AssetScope.BRAND,
      } as IBrand);

      const result = await renderLoadedBrand();

      await act(async () => {
        await result.current.handleUpdateAccount('scope', AssetScope.BRAND);
      });

      expect(mockPatch).toHaveBeenCalledWith('brand-1', {
        scope: AssetScope.BRAND,
      });
      expect(result.current.brand?.scope).toBe(AssetScope.BRAND);
      expect(mockNotifyError).not.toHaveBeenCalled();
    });

    it('rolls the optimistic scope back and notifies when the patch fails', async () => {
      mockPatch.mockRejectedValueOnce(new Error('patch failed'));

      const result = await renderLoadedBrand();

      await act(async () => {
        await result.current.handleUpdateAccount('scope', AssetScope.PUBLIC);
      });

      expect(result.current.brand?.scope).toBe(AssetScope.BRAND);
      expect(result.current.isUpdating).toBe(false);
      expect(mockNotifyError).toHaveBeenCalledWith(
        'PATCH /brands/brand-1 failed',
      );
    });

    it('ignores a concurrent toggle while an update is in flight', async () => {
      let resolvePatch: ((brand: IBrand) => void) | undefined;
      mockPatch.mockImplementationOnce(
        () =>
          new Promise<IBrand>((resolve) => {
            resolvePatch = resolve;
          }),
      );

      const result = await renderLoadedBrand();

      act(() => {
        void result.current.handleUpdateAccount('scope', AssetScope.PUBLIC);
      });

      await act(async () => {
        await result.current.handleUpdateAccount('scope', AssetScope.BRAND);
      });

      expect(mockPatch).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolvePatch?.({
          id: 'brand-1',
          links: [],
          scope: AssetScope.PUBLIC,
        } as IBrand);
      });

      expect(result.current.brand?.scope).toBe(AssetScope.PUBLIC);
    });
  });
});
