import { IngredientExportsController } from '@api/collections/ingredients/controllers/ingredient-exports.controller';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsOperationsController } from '@api/collections/ingredients/controllers/ingredients-operations.controller';
import { IngredientsTagsController } from '@api/collections/ingredients/controllers/ingredients-tags.controller';
import { IngredientReviewRequestsController } from '@api/collections/tasks/controllers/ingredient-review-requests.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { MediaDeliveryController } from '@api/services/media-urls/media-delivery.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const MEDIA_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /ingredients/:id/export',
    IngredientExportsController,
    IngredientExportsController.prototype.export,
  ],
  [
    'POST /ingredients/:ingredientId/clone',
    IngredientsOperationsController,
    IngredientsOperationsController.prototype.cloneIngredient,
  ],
  [
    'POST /ingredients/:ingredientId/metadata',
    IngredientsOperationsController,
    IngredientsOperationsController.prototype.refreshMetadata,
  ],
  [
    'PATCH /ingredients/:ingredientId/metadata',
    IngredientsOperationsController,
    IngredientsOperationsController.prototype.updateMetadata,
  ],
  [
    'DELETE /ingredients/:ingredientId',
    IngredientsOperationsController,
    IngredientsOperationsController.prototype.deleteIngredient,
  ],
  [
    'DELETE /ingredients',
    IngredientsOperationsController,
    IngredientsOperationsController.prototype.bulkDelete,
  ],
  [
    'PATCH /ingredients/:ingredientId/tags',
    IngredientsTagsController,
    IngredientsTagsController.prototype.updateTags,
  ],
  [
    'POST /ingredients/tags/bulk',
    IngredientsTagsController,
    IngredientsTagsController.prototype.bulkTag,
  ],
  [
    'PATCH /ingredients/:ingredientId',
    IngredientsController,
    IngredientsController.prototype.update,
  ],
  [
    'POST /ingredients/:ingredientId/cancellations',
    IngredientsController,
    IngredientsController.prototype.cancelGeneration,
  ],
  [
    'POST /ingredients/:ingredientId/review-requests',
    IngredientReviewRequestsController,
    IngredientReviewRequestsController.prototype.create,
  ],
  [
    'POST /ingredients/:id/public-derivative',
    MediaDeliveryController,
    MediaDeliveryController.prototype.preparePublic,
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
