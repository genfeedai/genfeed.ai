import { AssetCategory } from '@genfeedai/enums';
import type { IBrand } from '@genfeedai/interfaces';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindOne = vi.fn();
const mockGetService = vi.fn();
const mockCopyToClipboard = vi.fn();
const mockOpenUpload = vi.fn();
const mockFindPublicArticles = vi.fn();
const mockFindPublicImages = vi.fn();
const mockFindPublicVideos = vi.fn();

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
  const socketManager = { subscribe: vi.fn(() => vi.fn()) };
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

vi.mock('@genfeedai/services/external/public.service', () => {
  const publicService = {
    findPublicArticles: (...args: unknown[]) => mockFindPublicArticles(...args),
    findPublicImages: (...args: unknown[]) => mockFindPublicImages(...args),
    findPublicVideos: (...args: unknown[]) => mockFindPublicVideos(...args),
  };
  return { PublicService: { getInstance: vi.fn(() => publicService) } };
});

vi.mock('@genfeedai/services/core/clipboard.service', () => {
  const clipboardService = {
    copyToClipboard: (...args: unknown[]) => mockCopyToClipboard(...args),
  };
  return { ClipboardService: { getInstance: vi.fn(() => clipboardService) } };
});

vi.mock('@genfeedai/services/core/notifications.service', () => {
  const notificationsService = { error: vi.fn(), success: vi.fn() };
  return {
    NotificationsService: { getInstance: vi.fn(() => notificationsService) },
  };
});

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
    } as IBrand);
    mockGetService.mockResolvedValue({
      delete: vi.fn(),
      findOneBySlug: mockFindOne,
      patch: vi.fn(),
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
