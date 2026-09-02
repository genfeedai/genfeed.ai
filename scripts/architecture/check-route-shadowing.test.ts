import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appRootFor,
  collectControllers,
  collectRoutes,
  findRouteCollisions,
  normalizeFullPath,
  runCheckRouteShadowing,
  shadows,
} from './check-route-shadowing';

const CONTROLLER_PATH =
  'apps/server/api/src/collections/members/controllers/members.controller.ts';

describe('shadows', () => {
  it('reports a param segment sitting where a literal is expected', () => {
    expect(shadows(':memberId', 'invitations')).toBe(true);
    expect(shadows('members/:id', 'members/queue-status')).toBe(true);
  });

  it('ignores routes with a different segment count', () => {
    expect(shadows(':id/test', 'trigger-polling')).toBe(false);
    expect(shadows(':id', 'invitations/:invitationId')).toBe(false);
  });

  it('ignores two param routes of the same shape', () => {
    expect(shadows(':id', ':slug')).toBe(false);
  });

  it('ignores divergent literal segments', () => {
    expect(shadows('drafts/:id', 'published/latest')).toBe(false);
  });

  it('treats a splat as consuming every remaining segment', () => {
    expect(shadows('*', 'invitations')).toBe(true);
    expect(shadows('files/*path', 'files/manifest')).toBe(true);
    expect(shadows('files/*path', 'assets/manifest')).toBe(false);
  });
});

describe('collectRoutes', () => {
  it('groups routes per class in declaration order', () => {
    const [routes] = collectRoutes(
      `import { Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Get(':memberId')
        findOne() {}

        @Get('invitations')
        listInvitations() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(routes.map((route) => route.path)).toEqual([
      ':memberId',
      'invitations',
    ]);
    expect(routes[0]).toMatchObject({
      className: 'MembersController',
      handler: 'findOne',
      httpMethod: 'Get',
    });
  });

  it('expands an array of paths into one route each', () => {
    const [routes] = collectRoutes(
      `import { Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Get(['invitations', 'invites'])
        listInvitations() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(routes.map((route) => route.path)).toEqual([
      'invitations',
      'invites',
    ]);
  });

  it('skips decorators that only look like route decorators', () => {
    const classes = collectRoutes(
      `import { Get } from '@some/other-package';

      export class NotAController {
        @Get(':memberId')
        findOne() {}

        @Get('invitations')
        listInvitations() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(classes).toEqual([]);
  });
});

describe('collectControllers', () => {
  it('records the mounted prefix and the extended base class', () => {
    const [controller] = collectControllers(
      `import { Controller, Get } from '@nestjs/common';

      @Controller('runs')
      export class AgentRunsController extends BaseCRUDController {
        @Get('active')
        active() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(controller).toMatchObject({
      baseClassName: 'BaseCRUDController',
      className: 'AgentRunsController',
      prefixes: ['runs'],
    });
  });

  it('reads the object and array forms of @Controller', () => {
    const [objectForm] = collectControllers(
      `import { Controller, Get } from '@nestjs/common';

      @Controller({ path: 'runs', version: '1' })
      export class RunsController {
        @Get()
        findAll() {}
      }`,
      CONTROLLER_PATH,
    );
    const [arrayForm] = collectControllers(
      `import { Controller, Get } from '@nestjs/common';

      @Controller(['runs', 'action-runs'])
      export class RunsController {
        @Get()
        findAll() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(objectForm.prefixes).toEqual(['runs']);
    expect(arrayForm.prefixes).toEqual(['runs', 'action-runs']);
  });

  it('keeps an undecorated base class so subclasses can inherit its routes', () => {
    const [base] = collectControllers(
      `import { Get } from '@nestjs/common';

      export abstract class BaseCRUDController {
        @Get(':id')
        findOne() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(base).toMatchObject({ className: 'BaseCRUDController' });
    expect(base.prefixes).toEqual([]);
    expect(base.routes.map((route) => route.path)).toEqual([':id']);
  });

  it('drops a prefix that is not a literal rather than guessing at it', () => {
    const [controller] = collectControllers(
      `import { Controller, Get } from '@nestjs/common';

      @Controller(RUNS_PREFIX)
      export class RunsController {
        @Get()
        findAll() {}
      }`,
      CONTROLLER_PATH,
    );

    expect(controller.prefixes).toEqual([]);
  });
});

describe('normalizeFullPath', () => {
  it('joins the prefix and route path', () => {
    expect(normalizeFullPath('runs', 'active')).toBe('runs/active');
    expect(normalizeFullPath('runs', '')).toBe('runs');
    expect(normalizeFullPath('/runs/', '/active/')).toBe('runs/active');
  });

  it('collapses param names so :id and :runId are one path', () => {
    expect(normalizeFullPath('runs', ':id')).toBe(
      normalizeFullPath('runs', ':runId'),
    );
    expect(normalizeFullPath('runs', ':id')).toBe('runs/:param');
  });

  it('collapses every splat spelling', () => {
    expect(normalizeFullPath('files', '*path')).toBe('files/*');
    expect(normalizeFullPath('files', '*')).toBe('files/*');
  });
});

describe('appRootFor', () => {
  it('resolves the deployable app a controller belongs to', () => {
    expect(
      appRootFor('apps/server/api/src/collections/runs/x.controller.ts'),
    ).toBe('apps/server/api');
    expect(
      appRootFor('apps/server/mcp/src/mcp/controllers/mcp.controller.ts'),
    ).toBe('apps/server/mcp');
    expect(appRootFor('apps/app/app/api/route.ts')).toBe('apps/app');
  });

  it('returns null for code shared across apps', () => {
    expect(appRootFor('packages/libs/health/health.controller.ts')).toBeNull();
  });
});

describe('findRouteCollisions', () => {
  const controllersFrom = (
    files: Record<string, string>,
  ): ReturnType<typeof collectControllers> =>
    Object.entries(files).flatMap(([file, source]) =>
      collectControllers(source, file),
    );

  it('flags two controllers in one app mounting the same path', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/api/src/collections/agent-runs/a.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('runs')
          export class AgentRunsController {
            @Get(':id')
            findOne() {}
          }`,
        'apps/server/api/src/collections/runs/b.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('runs')
          export class RunsController {
            @Get(':runId')
            findOne() {}
          }`,
      }),
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({
      httpMethod: 'Get',
      path: 'runs/:param',
    });
    expect(collisions[0].claimants.map((claim) => claim.className)).toEqual([
      'AgentRunsController',
      'RunsController',
    ]);
  });

  it('allows the same path in two separate applications', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/alpha/src/train.controller.ts': `import { Controller, Post } from '@nestjs/common';

          @Controller()
          export class AlphaTrainController {
            @Post('train')
            train() {}
          }`,
        'apps/server/beta/src/train.controller.ts': `import { Controller, Post } from '@nestjs/common';

          @Controller()
          export class BetaTrainController {
            @Post('train')
            train() {}
          }`,
      }),
    );

    expect(collisions).toEqual([]);
  });

  it('compares shared controllers against every app that could import them', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/mcp/src/mcp/controllers/mcp.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller()
          export class McpController {
            @Get('health')
            getHealth() {}
          }`,
        'packages/libs/health/health.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('health')
          export class HealthController {
            @Get()
            check() {}
          }`,
      }),
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ httpMethod: 'Get', path: 'health' });
  });

  it('reports a shared-vs-shared collision once, not once per app', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/api/src/app.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('api-only')
          export class ApiController {
            @Get()
            findAll() {}
          }`,
        'apps/server/mcp/src/app.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('mcp-only')
          export class McpController {
            @Get()
            findAll() {}
          }`,
        'packages/libs/a/first.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('shared')
          export class FirstSharedController {
            @Get()
            findAll() {}
          }`,
        'packages/libs/b/second.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('shared')
          export class SecondSharedController {
            @Get()
            findAll() {}
          }`,
      }),
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0].path).toBe('shared');
  });

  it('counts routes a controller inherits from its base class', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/api/src/base.controller.ts': `import { Get } from '@nestjs/common';

          export abstract class BaseCRUDController {
            @Get(':id')
            findOne() {}
          }`,
        'apps/server/api/src/collections/agent-runs/a.controller.ts': `import { Controller } from '@nestjs/common';

          @Controller('runs')
          export class AgentRunsController extends BaseCRUDController {}`,
        'apps/server/api/src/collections/runs/b.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('runs')
          export class RunsController {
            @Get(':runId')
            findOne() {}
          }`,
      }),
    );

    expect(collisions).toHaveLength(1);
    expect(collisions[0].path).toBe('runs/:param');
  });

  it('does not treat an overridden inherited handler as a self-collision', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/api/src/base.controller.ts': `import { Get } from '@nestjs/common';

          export abstract class BaseCRUDController {
            @Get(':id')
            findOne() {}
          }`,
        'apps/server/api/src/collections/runs/a.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('runs')
          export class RunsController extends BaseCRUDController {
            @Get(':id')
            findOne() {}
          }`,
      }),
    );

    expect(collisions).toEqual([]);
  });

  it('ignores an abstract base that mounts no prefix of its own', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/api/src/base.controller.ts': `import { Get } from '@nestjs/common';

          export abstract class BaseCRUDController {
            @Get(':id')
            findOne() {}
          }`,
        'apps/server/api/src/collections/runs/a.controller.ts': `import { Controller } from '@nestjs/common';

          @Controller('runs')
          export class RunsController extends BaseCRUDController {}`,
      }),
    );

    expect(collisions).toEqual([]);
  });

  it('separates collisions by HTTP method', () => {
    const collisions = findRouteCollisions(
      controllersFrom({
        'apps/server/api/src/a.controller.ts': `import { Controller, Get } from '@nestjs/common';

          @Controller('runs')
          export class FirstController {
            @Get()
            findAll() {}
          }`,
        'apps/server/api/src/b.controller.ts': `import { Controller, Post } from '@nestjs/common';

          @Controller('runs')
          export class SecondController {
            @Post()
            create() {}
          }`,
      }),
    );

    expect(collisions).toEqual([]);
  });
});

describe('runCheckRouteShadowing', () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'route-shadowing-check-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags a static route declared below a wildcard sibling', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Get(':memberId')
        findOne() {}

        @Get('invitations')
        listInvitations() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([
      {
        shadowed: expect.objectContaining({
          handler: 'listInvitations',
          path: 'invitations',
        }),
        shadowedBy: expect.objectContaining({
          handler: 'findOne',
          path: ':memberId',
        }),
      },
    ]);
  });

  it('passes once the wildcard route is declared last', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { Controller, Delete, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Get('invitations')
        listInvitations() {}

        @Delete('invitations/:invitationId')
        revokeInvitation() {}

        @Get(':memberId')
        findOne() {}
      }`,
    );

    const result = runCheckRouteShadowing();

    expect(result.violations).toEqual([]);
    expect(result.routesScanned).toBe(3);
  });

  it('ignores a wildcard route on a different HTTP method', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { Controller, Get, Post } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Post(':memberId')
        replace() {}

        @Get('invitations')
        listInvitations() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([]);
  });

  it('treats an @All route as conflicting with every method', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { All, Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @All(':memberId')
        proxy() {}

        @Get('invitations')
        listInvitations() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([
      {
        shadowed: expect.objectContaining({ handler: 'listInvitations' }),
        shadowedBy: expect.objectContaining({ handler: 'proxy' }),
      },
    ]);
  });

  it('never compares routes across two classes in one file', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Get(':memberId')
        findOne() {}
      }

      @Controller('invitations')
      export class InvitationsController {
        @Get('pending')
        listPending() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([]);
  });

  it('skips routes whose path is not a literal', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { Controller, Get } from '@nestjs/common';

      const MEMBER_ROUTE = ':memberId';

      @Controller('members')
      export class MembersController {
        @Get(MEMBER_ROUTE)
        findOne() {}

        @Get('invitations')
        listInvitations() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([]);
  });

  it('honours a route-shadowing-ok annotation', () => {
    writeFixture(
      CONTROLLER_PATH,
      `import { Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class MembersController {
        @Get(':memberId')
        findOne() {}

        // route-shadowing-ok: served by an upstream rewrite, not this router.
        @Get('invitations')
        listInvitations() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([]);
  });

  it('ignores spec files', () => {
    writeFixture(
      'apps/server/api/src/collections/members/controllers/members.controller.spec.ts',
      `import { Controller, Get } from '@nestjs/common';

      @Controller('members')
      export class FixtureController {
        @Get(':memberId')
        findOne() {}

        @Get('invitations')
        listInvitations() {}
      }`,
    );

    expect(runCheckRouteShadowing().violations).toEqual([]);
  });
});

function writeFixture(relativePath: string, content: string): void {
  const absolute = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}
