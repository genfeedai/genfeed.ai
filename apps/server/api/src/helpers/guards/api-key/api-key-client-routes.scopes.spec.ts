import { ActivitiesController } from '@api/collections/activities/controllers/activities.controller';
import { AssetsController } from '@api/collections/assets/controllers/assets.controller';
import { InsightsController } from '@api/collections/insights/controllers/insights.controller';
import { ModelsController } from '@api/collections/models/controllers/models.controller';
import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { MusicsOperationsController } from '@api/collections/musics/controllers/musics-operations.controller';
import { MusicsUploadController } from '@api/collections/musics/controllers/musics-upload.controller';
import { OrganizationsOperationsController } from '@api/collections/organizations/controllers/organizations-operations.controller';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { ReviewInboxController } from '@api/collections/review-inbox/controllers/review-inbox.controller';
import { TaskCommentsController } from '@api/collections/task-comments/controllers/task-comments.controller';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { AdminModelPricingController } from '@api/endpoints/admin/model-pricing/model-pricing.controller';
import { AdminSeedsController } from '@api/endpoints/admin/seeds/seeds.controller';
import { AdminSystemNotificationsController } from '@api/endpoints/admin/system-notifications/system-notifications.controller';
import { WarmupAccountsController } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { StripeController } from '@api/services/integrations/stripe/controllers/stripe.controller';
import { ThreadsController } from '@api/services/integrations/threads/controllers/threads.controller';
import { PresignedUploadController } from '@api/services/uploads/presigned-upload.controller';
import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'PATCH /activities/:activityId',
    ActivitiesController,
    ActivitiesController.prototype.update,
  ],
  [
    'PATCH /activities',
    ActivitiesController,
    ActivitiesController.prototype.bulkUpdate,
  ],
  [
    'PATCH /assets/:assetId',
    AssetsController,
    AssetsController.prototype.update,
  ],
  [
    'DELETE /assets/:assetId',
    AssetsController,
    AssetsController.prototype.remove,
  ],
  [
    'PATCH /insights/:insightId',
    InsightsController,
    InsightsController.prototype.updateInsight,
  ],
  [
    'PATCH /models/:modelId',
    ModelsController,
    ModelsController.prototype.patch,
  ],
  [
    'POST /musics/upload',
    MusicsUploadController,
    MusicsUploadController.prototype.createUpload,
  ],
  ['PATCH /musics/:id', MusicsController, MusicsController.prototype.patch],
  ['DELETE /musics/:id', MusicsController, MusicsController.prototype.remove],
  ['POST /presets', PresetsController, PresetsController.prototype.create],
  [
    'PATCH /presets/:presetId',
    PresetsController,
    PresetsController.prototype.update,
  ],
  [
    'DELETE /presets/:presetId',
    PresetsController,
    PresetsController.prototype.remove,
  ],
  [
    'POST /review-inbox/decisions',
    ReviewInboxController,
    ReviewInboxController.prototype.decide,
  ],
  [
    'POST /review-inbox/decisions/batch',
    ReviewInboxController,
    ReviewInboxController.prototype.decideMany,
  ],
  [
    'DELETE /tasks/:taskId/comments/:commentId',
    TaskCommentsController,
    TaskCommentsController.prototype.remove,
  ],
  [
    'POST /trends/refresh',
    TrendsController,
    TrendsController.prototype.refreshTrends,
  ],
  [
    'PUT /trends/preferences',
    TrendsController,
    TrendsController.prototype.savePreferences,
  ],
  [
    'POST /admin/model-pricing/sync',
    AdminModelPricingController,
    AdminModelPricingController.prototype.sync,
  ],
  [
    'POST /admin/model-pricing/fix',
    AdminModelPricingController,
    AdminModelPricingController.prototype.fix,
  ],
  [
    'POST /admin/seeds/articles',
    AdminSeedsController,
    AdminSeedsController.prototype.articles,
  ],
  [
    'POST /admin/seeds/templates',
    AdminSeedsController,
    AdminSeedsController.prototype.templates,
  ],
  [
    'POST /admin/seeds/workflows',
    AdminSeedsController,
    AdminSeedsController.prototype.workflows,
  ],
  [
    'PATCH /admin/system-notifications',
    AdminSystemNotificationsController,
    AdminSystemNotificationsController.prototype.configure,
  ],
  [
    'POST /admin/warmup-accounts',
    WarmupAccountsController,
    WarmupAccountsController.prototype.create,
  ],
  [
    'POST /services/threads/connect',
    ThreadsController,
    ThreadsController.prototype.connect,
  ],
  [
    'POST /services/threads/verify',
    ThreadsController,
    ThreadsController.prototype.verify,
  ],
  [
    'POST /skills-pro/rollback',
    SkillDownloadController,
    SkillDownloadController.prototype.rollbackSkill,
  ],
];

describe.each(ADMIN_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create', 'articles:create']],
      [['posts:draft', 'posts:schedule', 'posts:publish', 'brands:write']],
      [['videos:read', 'images:read', 'brands:read', 'credits:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['admin']])('allows a key with %s', async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    });
  },
);

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'PATCH /organizations/:id/activate',
    OrganizationsOperationsController,
    OrganizationsOperationsController.prototype.switchOrganization,
  ],
];

describe.each(GEN_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:read', 'images:read', 'brands:read', 'posts:read']],
    [['brands:write', 'brand-kit:write', 'credentials:read']],
    [['posts:approve', 'posts:publish', 'analytics:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([
    ['videos:create'],
    ['images:create'],
    ['prompts:create'],
    ['articles:create'],
    ['posts:draft'],
    ['admin'],
  ])('allows a key with %s', async (scope) => {
    const guard = buildGuard(keyWithScopes([scope]));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).resolves.toBe(true);
  });
});

const MEDIA_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /musics',
    MusicsOperationsController,
    MusicsOperationsController.prototype.create,
  ],
  [
    'POST /ingredients/upload/presigned',
    PresignedUploadController,
    PresignedUploadController.prototype.generatePresignedUrl,
  ],
  [
    'POST /ingredients/upload/confirm/:id',
    PresignedUploadController,
    PresignedUploadController.prototype.confirmUpload,
  ],
];

describe.each(MEDIA_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['images:read', 'videos:read', 'brands:read', 'credits:read']],
      [['posts:draft', 'posts:schedule', 'posts:publish', 'analytics:read']],
      [
        [
          'prompts:create',
          'articles:create',
          'brands:write',
          'brand-kit:write',
        ],
      ],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([
      ['images:create'],
      ['images:update'],
      ['images:delete'],
      ['videos:create'],
      ['videos:update'],
      ['videos:delete'],
      ['admin'],
    ])('allows a key with %s', async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    });
  },
);

const MCPA_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /tasks/:taskId/comments',
    TaskCommentsController,
    TaskCommentsController.prototype.create,
  ],
  [
    'POST /skills-pro/install',
    SkillDownloadController,
    SkillDownloadController.prototype.installSkill,
  ],
];

describe.each(MCPA_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:read', 'images:read', 'brands:read', 'posts:read']],
    [['credits:read', 'analytics:read', 'credentials:read']],
    [['videos:update', 'images:delete', 'prompts:update']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([
    ['videos:create'],
    ['images:create'],
    ['prompts:create'],
    ['articles:create'],
    ['posts:draft'],
    ['brands:write'],
    ['brand-kit:write'],
    ['posts:schedule'],
    ['posts:approve'],
    ['posts:publish'],
    ['admin'],
  ])('allows a key with %s', async (scope) => {
    const guard = buildGuard(keyWithScopes([scope]));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).resolves.toBe(true);
  });
});

const ANALYTICS_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /insights/forecast',
    InsightsController,
    InsightsController.prototype.getForecast,
  ],
  [
    'POST /insights/viral',
    InsightsController,
    InsightsController.prototype.predictViral,
  ],
];

describe.each(ANALYTICS_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:read', 'images:read', 'brands:read', 'credits:read']],
      [['videos:create', 'images:create', 'prompts:create', 'posts:draft']],
      [['posts:approve', 'posts:publish', 'brands:write']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['analytics:read'], ['admin']])(
      'allows a key with %s',
      async (scope) => {
        const guard = buildGuard(keyWithScopes([scope]));

        await expect(
          guard.canActivate(
            routeContext(controller, handler, httpMethod(route)),
          ),
        ).resolves.toBe(true);
      },
    );
  },
);

const CREDITS_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /services/stripe/credits/checkout',
    StripeController,
    StripeController.prototype.createCreditsCheckoutSession,
  ],
];

describe.each(CREDITS_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:read', 'images:read', 'brands:read', 'analytics:read']],
      [['videos:create', 'images:create', 'prompts:create', 'posts:draft']],
      [['posts:approve', 'posts:publish', 'brands:write']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['credits:read'], ['credits:provision'], ['admin']])(
      'allows a key with %s',
      async (scope) => {
        const guard = buildGuard(keyWithScopes([scope]));

        await expect(
          guard.canActivate(
            routeContext(controller, handler, httpMethod(route)),
          ),
        ).resolves.toBe(true);
      },
    );
  },
);
