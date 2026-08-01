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
const mockLoggerError = vi.fn();
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

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ orgSlug: 'acme', slug: 'brand-1' })),
  usePathname: vi.fn(() => '/settings/brands/brand-1'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

// Every mocked hook/singleton below returns one stable object, matching the
// referential stability of the real context values and `getInstance()`
// singletons. Returning a fresh object per call makes effect dependencies
// change on every render and spins the hook in a render loop.
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => {
  const brandContext = { brands: [] };
  return { useBrand: vi.fn(() => brandContext) };
});

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => {
  const socketManager = {
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
  };
  return { useSocketManager: vi.fn(() => socketManager) };
});

vi.mock('@hooks/data/elements/use-elements/use-elements', () => {
  const elements = { imageModels: [] };
  return { useElements: vi.fn(() => elements) };
});

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => {
    const confirmModal = { openConfirm: vi.fn() };
    // Delegate rather than capture: the factory is hoisted above the `mock*`
    // declarations, so the reference has to be resolved at call time.
    const uploadModal = {
      openUpload: (...args: unknown[]) => mockOpenUpload(...args),
    };
    return {
      useConfirmModal: vi.fn(() => confirmModal),
      useUploadModal: vi.fn(() => uploadModal),
    };
  },
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

vi.mock('@genfeedai/services/core/notifications.service', () => {
  const notificationsService = {
    error: (...args: unknown[]) => mockNotifyError(...args),
    success: vi.fn(),
  };

  return {
    NotificationsService: {
      getInstance: vi.fn(() => notificationsService),
    },
  };
});

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: (...args: unknown[]) => mockLoggerError(...args),
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
      const patchError = {
        isAxiosError: true,
        message: 'Request failed with status code 400',
        response: {
          data: { message: 'Validation failed' },
          status: 400,
        },
      };
      mockPatch.mockRejectedValueOnce(patchError);

      const result = await renderLoadedBrand();

      await act(async () => {
        await expect(
          result.current.handleUpdateAccount('scope', AssetScope.PUBLIC),
        ).rejects.toBe(patchError);
      });

      expect(result.current.brand?.scope).toBe(AssetScope.BRAND);
      expect(result.current.isUpdating).toBe(false);
      expect(mockNotifyError).toHaveBeenCalledWith(
        'Some brand settings are invalid. Review them and try again.',
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        'PATCH /brands/brand-1 failed',
        expect.objectContaining({
          error: patchError,
          reportToSentry: false,
          tags: { surface: 'brand-settings' },
        }),
      );
    });
  });

  it('persists a second field edited while the first save is still in flight', async () => {
    let resolveFirstPatch: ((value: IBrand) => void) | null = null;
    const mockPatch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<IBrand>((resolve) => {
            resolveFirstPatch = resolve;
          }),
      )
      .mockImplementation(
        async (_id: string, data: Record<string, boolean | string>) =>
          ({ id: 'brand-1', links: [], ...data }) as IBrand,
      );

    mockGetService.mockResolvedValue({
      delete: vi.fn(),
      findOneBySlug: mockFindOne,
      patch: mockPatch,
    });

    const { result } = renderHook(() => useBrandDetail());

    await waitFor(() => {
      expect(result.current.brand).not.toBeNull();
    });

    let firstSave: Promise<void> | null = null;
    let secondSave: Promise<void> | null = null;

    // Blur a second field while the first save is still in flight.
    act(() => {
      firstSave = result.current.handleUpdateAccount('label', 'New name');
      secondSave = result.current.handleUpdateAccount(
        'description',
        'New description',
      );
    });

    // The second save is queued behind the first, not dropped.
    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveFirstPatch?.({
        id: 'brand-1',
        label: 'New name',
        links: [],
      } as IBrand);
      await Promise.all([firstSave, secondSave]);
    });

    expect(mockPatch).toHaveBeenCalledTimes(2);
    expect(mockPatch).toHaveBeenNthCalledWith(1, 'brand-1', {
      label: 'New name',
    });
    expect(mockPatch).toHaveBeenNthCalledWith(2, 'brand-1', {
      description: 'New description',
    });
    expect(result.current.brand?.description).toBe('New description');
  });
});
