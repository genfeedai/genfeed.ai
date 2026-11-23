import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsRemovalController } from '@api/collections/posts/controllers/operations/posts-removal.controller';
import type {
  PostRemovalParams,
  PostRemovalResult,
  PostRemovalService,
} from '@api/collections/posts/services/post-removal.service';
import { describe, expect, it } from 'vitest';

const user = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as unknown as User;

const removal: PostRemovalResult = {
  deletedOnPlatform: false,
  media: { deleted: [], kept: [] },
  platform: null,
  postId: 'post-1',
  previousStatus: 'draft',
  publishedUrl: null,
  verified: { mediaGone: true, postGone: true },
};

function controllerFor(result: PostRemovalResult | null) {
  const received: PostRemovalParams[] = [];
  const service = {
    removePost: async (params: PostRemovalParams) => {
      received.push(params);
      return result;
    },
  } as unknown as PostRemovalService;
  return { controller: new PostsRemovalController(service), received };
}

describe('PostsRemovalController', () => {
  it('returns what the removal reports, scoped to the caller organization', async () => {
    const { controller, received } = controllerFor(removal);

    await expect(
      controller.deletePost(user, 'post-1', {
        brandId: 'brand-1',
        includeMedia: true,
      }),
    ).resolves.toBe(removal);
    expect(received).toEqual([
      {
        brandId: 'brand-1',
        editor: { brandId: 'brand-1', userId: 'user-1' },
        includeMedia: true,
        organizationId: 'org-1',
        postId: 'post-1',
      },
    ]);
  });

  it('keeps the media unless asked, and is a 404 when the post is not found', async () => {
    const { controller, received } = controllerFor(null);

    await expect(
      controller.deletePost(user, 'post-1', {}),
    ).rejects.toMatchObject({ status: 404 });
    expect(received[0].includeMedia).toBe(false);
  });
});
