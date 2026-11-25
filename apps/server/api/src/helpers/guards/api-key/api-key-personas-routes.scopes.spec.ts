import { CharacterImageInspectionController } from '@api/collections/personas/controllers/character-image-inspection.controller';
import { PersonaReferencesController } from '@api/collections/personas/controllers/persona-references.controller';
import { PersonasController } from '@api/collections/personas/controllers/personas.controller';
import { PersonasContentController } from '@api/collections/personas/controllers/personas-content.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const EDIT_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /personas/:id/references',
    PersonaReferencesController,
    PersonaReferencesController.prototype.add,
  ],
  [
    'PUT /personas/:id/references',
    PersonaReferencesController,
    PersonaReferencesController.prototype.reorder,
  ],
  [
    'DELETE /personas/:id/references/:ingredientId',
    PersonaReferencesController,
    PersonaReferencesController.prototype.remove,
  ],
  [
    'PATCH /personas/:id/availability',
    PersonasController,
    PersonasController.prototype.updateAvailability,
  ],
  [
    'DELETE /personas/:id',
    PersonasController,
    PersonasController.prototype.remove,
  ],
  [
    'PATCH /personas/:id',
    PersonasController,
    PersonasController.prototype.patch,
  ],
];

describe.each(EDIT_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:create', 'images:create', 'prompts:create']],
    [['articles:create', 'posts:draft', 'posts:schedule']],
    [['brands:read', 'credits:read', 'analytics:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([['brands:write'], ['brand-kit:write'], ['admin']])(
    'allows a key with %s',
    async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    },
  );
});

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /personas/inspect-image',
    CharacterImageInspectionController,
    CharacterImageInspectionController.prototype.inspect,
  ],
  [
    'POST /personas/:id/content-plan',
    PersonasContentController,
    PersonasContentController.prototype.generateContentPlan,
  ],
  [
    'POST /personas/from-sheet',
    PersonasController,
    PersonasController.prototype.createFromSheet,
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

const POST_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /personas/:id/publish',
    PersonasContentController,
    PersonasContentController.prototype.publish,
  ],
];

describe.each(POST_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['posts:draft', 'posts:read', 'posts:approve']],
    [['videos:create', 'images:create', 'brands:write']],
    [['videos:read', 'images:read', 'brands:read', 'credits:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([['posts:schedule'], ['posts:publish'], ['admin']])(
    'allows a key with %s',
    async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    },
  );
});

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'PATCH /personas/:id/owner',
    PersonasController,
    PersonasController.prototype.moveOwnership,
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
