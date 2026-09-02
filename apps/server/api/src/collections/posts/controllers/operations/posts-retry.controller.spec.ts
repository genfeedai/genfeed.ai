vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsRetryController } from '@api/collections/posts/controllers/operations/posts-retry.controller';
import { PostRetryService } from '@api/collections/posts/services/post-retry.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ApiKeyScope } from '@genfeedai/contracts';
import { PostSerializer } from '@genfeedai/serializers';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

describe('PostsRetryController', () => {
  const organizationId = testId('org');
  const postId = testId('post');
  const request = {
    originalUrl: `/api/posts/${postId}/retry`,
    query: {},
  } as Request;
  const user = {
    id: testId('user'),
    organizationId,
  } as User;
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const postRetryService = {
    retryPost: vi.fn(),
  };
  const controller = new PostsRetryController(
    logger as unknown as LoggerService,
    postRetryService as unknown as PostRetryService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delegates retry and serializes the post response', async () => {
    const post = { id: postId };
    postRetryService.retryPost.mockResolvedValue(post);

    await expect(controller.retryPost(request, postId, user)).resolves.toEqual({
      data: post,
    });
    expect(postRetryService.retryPost).toHaveBeenCalledWith(
      postId,
      organizationId,
    );
    expect(serializeSingle).toHaveBeenCalledWith(request, PostSerializer, post);
    expect(logger.log).toHaveBeenCalledWith(
      'PostsRetryController.retryPost started',
      expect.objectContaining({
        operation: 'retryPost',
        service: 'PostsRetryController',
      }),
    );
  });

  it('rejects API-key retry without schedule scope before reads or writes', async () => {
    const postsService = {
      findOne: vi.fn(),
      patch: vi.fn(),
    };
    const guardedController = new PostsRetryController(
      logger as unknown as LoggerService,
      new PostRetryService(postsService as unknown as PostsService),
    );
    const apiKeyUser = {
      ...user,
      isApiKey: true,
      scopes: [],
    } as User;

    await expect(
      guardedController.retryPost(request, postId, apiKeyUser),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
        requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
      }),
    });
    expect(postsService.findOne).not.toHaveBeenCalled();
    expect(postsService.patch).not.toHaveBeenCalled();
  });

  it('allows API-key retry with the schedule scope', async () => {
    const post = { id: postId };
    postRetryService.retryPost.mockResolvedValue(post);

    await controller.retryPost(request, postId, {
      ...user,
      isApiKey: true,
      scopes: [ApiKeyScope.POSTS_SCHEDULE],
    } as User);

    expect(postRetryService.retryPost).toHaveBeenCalledWith(
      postId,
      organizationId,
    );
  });
});
