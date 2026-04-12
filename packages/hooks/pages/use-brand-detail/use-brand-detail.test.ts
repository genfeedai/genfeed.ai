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
  useParams: vi.fn(() => ({ id: 'brand-1' })),
  usePathname: vi.fn(() => '/settings/brands/brand-1'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
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
    getInstance: vi.fn(() => ({
      findPublicArticles: mockFindPublicArticles,
      findPublicImages: mockFindPublicImages,
      findPublicVideos: mockFindPublicVideos,
    })),
  },
}));

vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: vi.fn(() => ({
      copyToClipboard: mockCopyToClipboard,
    })),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
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
    } as IBrand);
    mockGetService.mockResolvedValue({
      delete: vi.fn(),
      findOne: mockFindOne,
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
});
