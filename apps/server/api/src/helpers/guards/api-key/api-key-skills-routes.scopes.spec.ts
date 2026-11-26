import { SkillLibraryController } from '@api/collections/skills/controllers/skill-library.controller';
import { SkillPackageImportController } from '@api/collections/skills/controllers/skill-package-import.controller';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
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

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /skills/scoped',
    SkillLibraryController,
    SkillLibraryController.prototype.createScopedSkill,
  ],
  [
    'POST /skills/:id/fork',
    SkillLibraryController,
    SkillLibraryController.prototype.forkSkill,
  ],
  [
    'POST /skills/:id/publish',
    SkillLibraryController,
    SkillLibraryController.prototype.publishSkill,
  ],
  [
    'POST /skills/:id/archive',
    SkillLibraryController,
    SkillLibraryController.prototype.archiveSkill,
  ],
  [
    'POST /skills/:id/rollback',
    SkillLibraryController,
    SkillLibraryController.prototype.rollbackSkill,
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

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /skills/import',
    SkillPackageImportController,
    SkillPackageImportController.prototype.importSkillPackage,
  ],
  ['POST /skills', SkillsController, SkillsController.prototype.createSkill],
  [
    'POST /skills/:id/customize',
    SkillsController,
    SkillsController.prototype.customizeSkill,
  ],
  [
    'PATCH /skills/:id',
    SkillsController,
    SkillsController.prototype.updateSkill,
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
