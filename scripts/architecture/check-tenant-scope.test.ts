import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  diffTenantScopeBaseline,
  discoverTenantModels,
  parseTenantScopeBaseline,
  runTenantScopeCheck,
  type TenantScopeBaselineEntry,
} from './check-tenant-scope';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('check-tenant-scope', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'tenant-scope-check-'));
    writeFixture(
      'packages/prisma/prisma/schema.prisma',
      `
        model Post {
          id             String  @id
          organizationId String
          isDeleted      Boolean @default(false)
        }

        model Organization {
          id        String  @id
          isDeleted Boolean @default(false)
        }

        model AuditLog {
          id             String @id
          organizationId String
        }
      `,
    );
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  it('discovers only models carrying both tenant fields', () => {
    const schema = readFileSync(
      path.join(testDir, 'packages/prisma/prisma/schema.prisma'),
      'utf8',
    );

    expect(discoverTenantModels(schema)).toEqual([
      { delegate: 'post', model: 'Post' },
    ]);
  });

  it('flags a deliberate unscoped query for each absent scope key', () => {
    writeFixture(
      'apps/server/api/src/unsafe.service.ts',
      `
        export async function unsafe(prisma: unknown): Promise<void> {
          await prisma.post.findMany({ where: { id: 'post-1' } });
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(result.findings).toEqual([
      expect.objectContaining({
        delegate: 'post',
        reason: 'missing-organization-id',
      }),
      expect.objectContaining({
        delegate: 'post',
        reason: 'missing-is-deleted',
      }),
    ]);
  });

  it('reports one missing key when the other is present', () => {
    writeFixture(
      'apps/server/api/src/partial.service.ts',
      `
        export async function partial(prisma: unknown): Promise<void> {
          await prisma.post.findFirst({
            where: { organizationId: 'org-1' },
          });
          await prisma.post.count({
            where: { isDeleted: false },
          });
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(
      result.findings.map(({ method, reason }) => ({
        method,
        reason,
      })),
    ).toEqual([
      { method: 'findFirst', reason: 'missing-is-deleted' },
      { method: 'count', reason: 'missing-organization-id' },
    ]);
  });

  it('accepts canonical scopedWhere and locally resolvable objects', () => {
    writeFixture(
      'apps/server/api/src/safe.service.ts',
      `
        import {
          scopedWhere as tenantWhere,
        } from '@genfeedai/server';

        export async function safe(prisma: unknown): Promise<void> {
          const where = {
            organizationId: 'org-1',
            isDeleted: false,
          };
          const args = { where };

          await prisma.post.findFirst({
            where: tenantWhere('org-1', { id: 'post-1' }),
          });
          await prisma.post.findMany(args);
          await prisma.post.count({
            where: {
              AND: [
                { organizationId: 'org-1' },
                { isDeleted: false },
              ],
            },
          });
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(result.findings).toEqual([]);
  });

  it('does not accept a same-named helper from another module', () => {
    writeFixture(
      'apps/server/api/src/spoofed.service.ts',
      `
        import { scopedWhere } from './unsafe-helper';

        export async function spoofed(prisma: unknown): Promise<void> {
          await prisma.post.findMany({
            where: scopedWhere('org-1'),
          });
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(result.findings).toEqual([
      expect.objectContaining({ reason: 'unresolved-where' }),
    ]);
  });

  it('surfaces dynamic where construction as an analyzer boundary', () => {
    writeFixture(
      'apps/server/server/src/dynamic.service.ts',
      `
        export async function dynamic(
          prisma: unknown,
          where: unknown,
        ): Promise<void> {
          await prisma.post.updateMany({ where, data: {} });
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(result.findings).toEqual([
      expect.objectContaining({
        reason: 'unresolved-where',
      }),
    ]);
  });

  it('requires canonical scope keys to follow unknown spreads', () => {
    writeFixture(
      'apps/server/server/src/spread-order.service.ts',
      `
        export async function spreadOrder(
          prisma: unknown,
          dynamicWhere: unknown,
        ): Promise<void> {
          await prisma.post.findMany({
            where: {
              organizationId: 'org-1',
              isDeleted: false,
              ...dynamicWhere,
            },
          });
          await prisma.post.findMany({
            where: {
              ...dynamicWhere,
              organizationId: 'org-1',
              isDeleted: false,
            },
          });
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(result.findings).toEqual([
      expect.objectContaining({
        reason: 'unresolved-where',
      }),
    ]);
  });

  it('requires a non-empty reason on the directly preceding line', () => {
    writeFixture(
      'apps/server/api/src/suppressed.service.ts',
      `
        export async function suppressed(prisma: unknown): Promise<void> {
          // tenant-scope-ignore: platform-admin inventory is intentionally global
          await prisma.post.findMany({});

          // tenant-scope-ignore:
          await prisma.post.count({});
        }
      `,
    );

    const result = runTenantScopeCheck({ rootDir: testDir });

    expect(result.findings).toEqual([
      expect.objectContaining({
        method: 'count',
        reason: 'missing-where',
      }),
    ]);
    expect(result.suppressionViolations).toEqual([
      expect.objectContaining({
        line: 6,
        message: expect.stringContaining('non-empty reason'),
      }),
    ]);
  });

  it('ratchets exact findings and reports both regressions and stale debt', () => {
    writeFixture(
      'apps/server/api/src/ratchet.service.ts',
      `
        export async function ratchet(prisma: unknown): Promise<void> {
          await prisma.post.findMany({ where: { id: 'post-1' } });
        }
      `,
    );

    const { findings } = runTenantScopeCheck({ rootDir: testDir });
    const currentEntry = toBaselineEntry(findings[0]);
    const staleEntry: TenantScopeBaselineEntry = {
      delegate: 'post',
      file: 'apps/server/api/src/gone.service.ts',
      fingerprint: 'stale-fingerprint',
      method: 'findMany',
      model: 'Post',
      reason: 'missing-where',
    };
    const diff = diffTenantScopeBaseline(findings, [currentEntry, staleEntry]);

    expect(diff.regressions).toHaveLength(1);
    expect(diff.stale).toEqual([staleEntry]);
  });

  it('parses a versioned machine-readable baseline and rejects duplicates', () => {
    const entry: TenantScopeBaselineEntry = {
      delegate: 'post',
      file: 'apps/server/api/src/example.ts',
      fingerprint: 'same',
      method: 'findMany',
      model: 'Post',
      reason: 'missing-where',
    };
    const baseline = {
      entries: [entry],
      schemaPath: 'packages/prisma/prisma/schema.prisma',
      version: 1,
    };

    expect(parseTenantScopeBaseline(JSON.stringify(baseline))).toEqual(
      baseline,
    );
    expect(() =>
      parseTenantScopeBaseline(
        JSON.stringify({
          ...baseline,
          entries: [entry, entry],
        }),
      ),
    ).toThrowError('duplicate fingerprint');
  });

  it('keeps the retired Mongoose analyzer and script entry absent', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(
      existsSync(path.join(REPOSITORY_ROOT, 'scripts/check-multi-tenancy.ts')),
    ).toBe(false);
    expect(
      existsSync(
        path.join(REPOSITORY_ROOT, 'scripts/multi-tenancy-baseline.json'),
      ),
    ).toBe(false);
    expect(packageJson.scripts).not.toHaveProperty('check:multi-tenancy');
  });

  function writeFixture(relativePath: string, content: string): void {
    const filePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, 'utf8');
  }
});

function toBaselineEntry(
  finding:
    | {
        delegate: string;
        file: string;
        fingerprint: string;
        method: string;
        model: string;
        reason:
          | 'missing-is-deleted'
          | 'missing-organization-id'
          | 'missing-where'
          | 'unresolved-where';
      }
    | undefined,
): TenantScopeBaselineEntry {
  if (!finding) {
    throw new Error('Expected a tenant-scope finding fixture.');
  }

  return {
    delegate: finding.delegate,
    file: finding.file,
    fingerprint: finding.fingerprint,
    method: finding.method,
    model: finding.model,
    reason: finding.reason,
  };
}
