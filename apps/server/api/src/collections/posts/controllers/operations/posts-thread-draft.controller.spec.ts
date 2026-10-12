import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsThreadDraftController } from '@api/collections/posts/controllers/operations/posts-thread-draft.controller';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

describe('PostsThreadDraftController', () => {
  const organizationId = testId('org');
  const postId = testId('post');
  const request = {
    headers: {},
    originalUrl: `/api/posts/${postId}/thread-drafts`,
    query: {},
  } as unknown as Request;
  const user = {
    brandId: testId('brand'),
    id: testId('user'),
    organizationId,
    userId: testId('user'),
  } as User;
  const dto = { count: 3, tone: TweetTone.CASUAL };
  const xPost = {
    id: postId,
    organizationId,
    platform: CredentialPlatform.TWITTER,
  };

  const logger = { error: vi.fn() };
  const postsService = {
    count: vi.fn(),
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const postGenerationService = { draftThread: vi.fn() };
  const controller = new PostsThreadDraftController(
    logger as unknown as LoggerService,
    postGenerationService as unknown as PostGenerationService,
    postsService as unknown as PostsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    postsService.findOne.mockResolvedValue(xPost);
    postsService.count.mockResolvedValue(0);
    postGenerationService.draftThread.mockResolvedValue([
      'Reply one',
      'Reply two',
    ]);
  });

  it('is registered as POST /posts/:postId/thread-drafts', () => {
    const handler = PostsThreadDraftController.prototype.draftThread;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      ':postId/thread-drafts',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });

  it('returns proposed replies without creating or changing posts', async () => {
    const result = await controller.draftThread(request, user, postId, dto);

    expect(result).toEqual({ posts: ['Reply one', 'Reply two'] });
    expect(postGenerationService.draftThread).toHaveBeenCalledWith(
      xPost,
      dto,
      user,
      undefined,
    );
    expect(postsService.create).not.toHaveBeenCalled();
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('rejects posts that already have thread replies', async () => {
    postsService.count.mockResolvedValueOnce(2);

    await expect(
      controller.draftThread(request, user, postId, dto),
    ).rejects.toThrow(HttpException);
    expect(postGenerationService.draftThread).not.toHaveBeenCalled();
  });

  it('rejects non-X posts', async () => {
    postsService.findOne.mockResolvedValueOnce({
      ...xPost,
      platform: CredentialPlatform.YOUTUBE,
    });

    await expect(
      controller.draftThread(request, user, postId, dto),
    ).rejects.toThrow(HttpException);
  });

  it('rejects posts from another organization', async () => {
    postsService.findOne.mockResolvedValueOnce({
      ...xPost,
      organizationId: testId('other'),
    });

    await expect(
      controller.draftThread(request, user, postId, dto),
    ).rejects.toThrow(HttpException);
    expect(postGenerationService.draftThread).not.toHaveBeenCalled();
  });

  it('rejects a missing post', async () => {
    postsService.findOne.mockResolvedValueOnce(null);

    await expect(
      controller.draftThread(request, user, postId, dto),
    ).rejects.toThrow(HttpException);
  });

  it('reports a generation failure without saving anything', async () => {
    postGenerationService.draftThread.mockRejectedValueOnce(
      new Error('model unavailable'),
    );

    await expect(
      controller.draftThread(request, user, postId, dto),
    ).rejects.toThrow(HttpException);
    expect(logger.error).toHaveBeenCalled();
    expect(postsService.create).not.toHaveBeenCalled();
  });
});
