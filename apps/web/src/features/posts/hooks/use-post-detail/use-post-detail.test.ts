import { queryClientWrapper } from '@app-tests/query-client.harness';
import {
  CredentialPlatform,
  PageScope,
  PostCategory,
  PostStatus,
} from '@genfeedai/contracts';
import type { ICredential, IPost } from '@genfeedai/contracts/interfaces';
import { createPostFixture } from '@genfeedai/helpers/testing/entity-fixtures';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostDetail } from '@/features/posts/hooks/use-post-detail/use-post-detail';

const mockFindOne = vi.fn();
const mockGetPostsService = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketSubscriptions: vi.fn(),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.hooks',
  () => ({
    useConfirmDeleteModal: vi.fn(() => ({ openConfirmDelete: vi.fn() })),
    useGalleryModal: vi.fn(() => ({ openGallery: vi.fn() })),
    useGenerateIllustrationModal: vi.fn(() => ({
      openGenerateIllustration: vi.fn(),
    })),
  }),
);

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

vi.mock('@genfeedai/utils/carousel-validation', () => ({
  getCarouselLimits: vi.fn(() => ({ max: 10, min: 1 })),
  validateCarouselCount: vi.fn(() => ({ errors: [], valid: true })),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/publishing/posts/post-1'),
  useParams: vi.fn(() => ({ brandSlug: 'brand-slug', orgSlug: 'acme' })),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
}));

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';

describe('usePostDetail', () => {
  const post: IPost = createPostFixture({
    category: PostCategory.TEXT,
    children: [],
    credential: {
      id: 'cred-1',
      platform: CredentialPlatform.TWITTER,
    } as ICredential,
    description: 'Draft description',
    id: 'post-1',
    label: 'Draft label',
    platform: CredentialPlatform.TWITTER,
    scheduledDate: '2025-01-01',
    status: PostStatus.DRAFT,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOne.mockResolvedValue(post);
    mockGetPostsService.mockResolvedValue({
      findOne: mockFindOne,
    });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetPostsService,
    );
  });

  it('loads post data on mount', async () => {
    const { result } = renderHook(
      () => usePostDetail({ postId: 'post-1', scope: PageScope.PUBLISHING }),
      { wrapper: queryClientWrapper() },
    );

    await waitFor(() => {
      expect(result.current.post).not.toBeNull();
    });

    expect(result.current.post?.id).toBe('post-1');
    expect(result.current.isEditable).toBe(true);
    expect(mockFindOne).toHaveBeenCalledWith('post-1');
  });

  it('refreshes post data when requested', async () => {
    const { result } = renderHook(
      () => usePostDetail({ postId: 'post-1', scope: PageScope.PUBLISHING }),
      { wrapper: queryClientWrapper() },
    );

    await waitFor(() => {
      expect(mockFindOne).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.refreshPost();
    });

    expect(mockFindOne).toHaveBeenCalledTimes(2);
  });
});
