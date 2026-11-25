import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runApiKeyRouteScopeCheck } from './check-api-key-route-scopes';

const rootDirs: string[] = [];

afterEach(() => {
  for (const rootDir of rootDirs.splice(0)) {
    rmSync(rootDir, { force: true, recursive: true });
  }
});

function fixture(files: Record<string, string>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'api-key-route-scopes-'));
  rootDirs.push(rootDir);

  for (const [file, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  }

  return rootDir;
}

const CONTROLLER = 'apps/server/api/src/things/things.controller.ts';

describe('API-key route scope ratchet', () => {
  it('flags every mutating handler that names no scope', () => {
    const rootDir = fixture({
      [CONTROLLER]: `
        @Controller('things')
        export class ThingsController {
          @Get() list() {}
          @Post() create() {}
          @Put(':id') replace() {}
          @Patch(':id') update() {}
          @Delete(':id') remove() {}
        }
      `,
    });

    const result = runApiKeyRouteScopeCheck({ baseline: [], rootDir });

    expect(result.mutatingRouteCount).toBe(4);
    expect(result.violations.map((violation) => violation.kind)).toEqual([
      'new-unscoped-route',
      'new-unscoped-route',
      'new-unscoped-route',
      'new-unscoped-route',
    ]);
    expect(result.unscopedRoutes.map((route) => route.key)).toEqual([
      `${CONTROLLER}::ThingsController.create`,
      `${CONTROLLER}::ThingsController.remove`,
      `${CONTROLLER}::ThingsController.replace`,
      `${CONTROLLER}::ThingsController.update`,
    ]);
  });

  it('accepts a scope on the handler, a scope on the class and an explicit read marker', () => {
    const rootDir = fixture({
      [CONTROLLER]: `
        @Controller('things')
        export class ThingsController {
          @Post()
          @RequiredScopes(ApiKeyScope.IMAGES_CREATE)
          create() {}

          @Post('preview')
          @ApiKeyReadAccess()
          preview() {}
        }

        @Controller('admin-things')
        @RequiredScopes(ApiKeyScope.ADMIN)
        export class AdminThingsController {
          @Delete(':id') remove() {}
        }
      `,
    });

    const result = runApiKeyRouteScopeCheck({ baseline: [], rootDir });

    expect(result.mutatingRouteCount).toBe(3);
    expect(result.violations).toEqual([]);
  });

  it('accepts a baselined handler and fails the day it gains a scope', () => {
    const key = `${CONTROLLER}::ThingsController.create`;
    const unscoped = fixture({
      [CONTROLLER]: `
        @Controller('things')
        export class ThingsController {
          @Post() create() {}
        }
      `,
    });
    const scoped = fixture({
      [CONTROLLER]: `
        @Controller('things')
        export class ThingsController {
          @Post()
          @RequiredScopes(ApiKeyScope.IMAGES_CREATE)
          create() {}
        }
      `,
    });

    expect(
      runApiKeyRouteScopeCheck({ baseline: [key], rootDir: unscoped })
        .violations,
    ).toEqual([]);
    expect(
      runApiKeyRouteScopeCheck({ baseline: [key], rootDir: scoped }).violations,
    ).toEqual([
      {
        entry: key,
        kind: 'stale-baseline-entry',
        message: expect.stringContaining('only shrinks'),
      },
    ]);
  });

  it('ignores classes that are not controllers', () => {
    const rootDir = fixture({
      [CONTROLLER]: `
        export class Helper {
          @Post() create() {}
        }
      `,
    });

    expect(
      runApiKeyRouteScopeCheck({ baseline: [], rootDir }).mutatingRouteCount,
    ).toBe(0);
  });
});
