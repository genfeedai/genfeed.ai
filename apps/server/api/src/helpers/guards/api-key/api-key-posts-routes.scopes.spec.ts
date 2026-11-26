import { PostsAnalyticsController } from '@api/collections/posts/controllers/analytics/posts-analytics.controller';
import { PostsAccountGenerationRetryController } from '@api/collections/posts/controllers/operations/posts-account-generation-retry.controller';
import { PostsGenerationController } from '@api/collections/posts/controllers/operations/posts-generation.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { PostsThreadDraftController } from '@api/collections/posts/controllers/operations/posts-thread-draft.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';

type PostsRoute = readonly [string, ControllerClass, Handler];

const DRAFTING_ROUTES: readonly PostsRoute[] = [
  [
    'POST /posts/track-link',
    PostsAnalyticsController,
    PostsAnalyticsController.prototype.trackLink,
  ],
  [
    'POST /posts/:postId/generation-retries',
    PostsAccountGenerationRetryController,
    PostsAccountGenerationRetryController.prototype.retryAccountGeneration,
  ],
  [
    'POST /posts/source-variations',
    PostsGenerationController,
    PostsGenerationController.prototype.generateSourceVariations,
  ],
  [
    'POST /posts/:postId/repurpose',
    PostsGenerationController,
    PostsGenerationController.prototype.repurposePost,
  ],
  [
    'POST /posts/draft-generations',
    PostsGenerationController,
    PostsGenerationController.prototype.generateDraftText,
  ],
  [
    'POST /posts/account-generations',
    PostsGenerationController,
    PostsGenerationController.prototype.generateAccountContent,
  ],
  [
    'POST /posts/:postId/thread-expansions',
    PostsGenerationController,
    PostsGenerationController.prototype.expandToThread,
  ],
  [
    'POST /posts/:postId/enhancements',
    PostsGenerationController,
    PostsGenerationController.prototype.enhancePost,
  ],
  [
    'POST /posts/:postId/seo-scores',
    PostsGenerationController,
    PostsGenerationController.prototype.scoreSeo,
  ],
  [
    'POST /posts/hook-generations',
    PostsGenerationController,
    PostsGenerationController.prototype.generateHookVariations,
  ],
  [
    'POST /posts/:postId/remixes',
    PostsOperationsController,
    PostsOperationsController.prototype.createRemixPost,
  ],
  [
    'POST /posts/:postId/thread-drafts',
    PostsThreadDraftController,
    PostsThreadDraftController.prototype.draftThread,
  ],
];

const ANALYTICS_ROUTES: readonly PostsRoute[] = [
  [
    'POST /posts/:postId/refresh-analytics',
    PostsAnalyticsController,
    PostsAnalyticsController.prototype.refreshAnalytics,
  ],
  [
    'POST /posts/analytics',
    PostsAnalyticsController,
    PostsAnalyticsController.prototype.refreshAllAnalytics,
  ],
];

const KEY_WITHOUT_A_POST_SCOPE = [
  'images:create',
  'videos:create',
  'prompts:create',
  'brands:write',
];

async function canCall(
  scopes: string[],
  controller: ControllerClass,
  handler: Handler,
): Promise<boolean> {
  const guard = buildGuard(keyWithScopes(scopes));
  return guard.canActivate(routeContext(controller, handler, 'POST'));
}

describe.each(DRAFTING_ROUTES)(
  '%s API key scope',
  (_route, controller, handler) => {
    it('refuses a key with no post scope', async () => {
      await expect(
        canCall(KEY_WITHOUT_A_POST_SCOPE, controller, handler),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it('refuses a key that can only read posts', async () => {
      await expect(
        canCall(['posts:read', 'analytics:read'], controller, handler),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([
      ['posts:draft'],
      ['posts:schedule'],
      ['posts:publish'],
      ['admin'],
    ])('allows a key with %s', async (scope) => {
      await expect(canCall([scope], controller, handler)).resolves.toBe(true);
    });
  },
);

describe.each(ANALYTICS_ROUTES)(
  '%s API key scope',
  (_route, controller, handler) => {
    it('refuses a key with no post or analytics scope', async () => {
      await expect(
        canCall(KEY_WITHOUT_A_POST_SCOPE, controller, handler),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['analytics:read'], ['posts:read'], ['posts:draft'], ['admin']])(
      'allows a key with %s',
      async (scope) => {
        await expect(canCall([scope], controller, handler)).resolves.toBe(true);
      },
    );
  },
);
