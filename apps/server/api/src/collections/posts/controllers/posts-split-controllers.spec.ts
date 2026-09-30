import { PostsAnalyticsController } from '@api/collections/posts/controllers/analytics/posts-analytics.controller';
import { ContentMentionsController } from '@api/collections/posts/controllers/content-mentions.controller';
import { PostsGenerationController } from '@api/collections/posts/controllers/operations/posts-generation.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsRetryController } from '@api/collections/posts/controllers/operations/posts-retry.controller';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { PostsModule } from '@api/collections/posts/posts.module';
import { API_KEY_SCOPES_KEY } from '@api/helpers/guards/api-key/api-key.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ApiKeyScope } from '@genfeedai/contracts';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

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

  it.each([PostsOperationsController, PostsRetryController])(
    'preserves the shared posts role guard on %s',
    (controllerClass) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controllerClass)).toContain(
        RolesGuard,
      );
    },
  );

  it('registers every static sibling before the wildcard CRUD controller', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PostsModule),
    ).toEqual([
      ContentMentionsController,
      PostsAnalyticsController,
      PostsGenerationController,
      PostsOperationsController,
      PostsRetryController,
      PostsController,
    ]);
  });
});
