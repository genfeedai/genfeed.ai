import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  collectRoutes,
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
