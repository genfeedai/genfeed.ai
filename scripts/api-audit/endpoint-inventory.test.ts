import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runEndpointInventory } from './endpoint-inventory';

describe('endpoint inventory audit', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'endpoint-inventory-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('extracts controller routes, guards, public markers, and fixture requirements', () => {
    writeFixture(
      'apps/server/api/src/demo/demo.controller.ts',
      `
      @Controller('brands/:brandId/posts')
      @UseGuards(RolesGuard)
      export class DemoController {
        @Get()
        list(@Query() query: Record<string, unknown>) {
          return query;
        }

        @Get(':postId')
        read(@Param('postId') postId: string) {
          return postId;
        }

        @Public()
        @Post()
        create(@Body() body: Record<string, unknown>) {
          return body;
        }
      }
      `,
    );

    const result = runEndpointInventory({ rootDir: testDir });

    expect(result.summary.endpoints).toBe(3);
    expect(result.summary.byMethod).toMatchObject({ GET: 2, POST: 1 });
    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          auth: 'guarded',
          guards: ['RolesGuard'],
          method: 'GET',
          path: '/v1/brands/:brandId/posts',
          requiresFixture: ['path params', 'query shape'],
        }),
        expect.objectContaining({
          auth: 'public',
          bodyParams: ['*:body'],
          method: 'POST',
          path: '/v1/brands/:brandId/posts',
          requiresFixture: ['non-idempotent method', 'path params', 'body'],
        }),
      ]),
    );
  });

  it('marks static GET routes as smoke eligible', () => {
    writeFixture(
      'apps/server/api/src/health/health.controller.ts',
      `
      @Controller('health')
      export class HealthController {
        @Public()
        @Get()
        status() {
          return { ok: true };
        }
      }
      `,
    );

    const result = runEndpointInventory({ rootDir: testDir });

    expect(result.summary.smokeEligible).toBe(1);
    expect(result.endpoints[0]).toMatchObject({
      auth: 'public',
      path: '/v1/health',
      smokeEligible: true,
    });
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
