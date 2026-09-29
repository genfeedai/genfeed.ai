import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsRetryController } from '@api/collections/posts/controllers/operations/posts-retry.controller';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

describe('Posts split controllers', () => {
  it('preserves retry route and OpenAPI metadata on the sibling controller', () => {
    const handler = PostsRetryController.prototype.retryPost;

    expect(Reflect.getMetadata(PATH_METADATA, PostsRetryController)).toBe(
      'posts',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':postId/retry');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata('swagger/apiOperation', handler)).toMatchObject({
      operationId: 'PostsOperationsController.retryPost',
      summary: 'retryPost',
    });
    expect(Reflect.getMetadata(API_KEY_SCOPES_KEY, handler)).toEqual([
      ApiKeyScope.POSTS_SCHEDULE,
    ]);
    expect(
      Reflect.get(PostsOperationsController.prototype, 'retryPost'),
    ).toBeUndefined();
  });
});
