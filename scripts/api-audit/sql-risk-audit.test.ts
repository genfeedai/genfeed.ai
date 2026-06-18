import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runSqlRiskAudit } from './sql-risk-audit';

describe('sql risk audit', () => {
  let originalCwd = '';
  let testDir = '';

  beforeEach(() => {
    originalCwd = process.cwd();
    testDir = mkdtempSync(path.join(tmpdir(), 'sql-risk-audit-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(testDir, { force: true, recursive: true });
  });

  it('flags raw SQL, unbounded reads, broad includes, and unguarded bulk writes', () => {
    writeFixture(
      'apps/server/api/src/posts/posts.service.ts',
      `
      export class PostsService {
        constructor(private readonly prisma: PrismaService) {}

        async list(organizationId: string) {
          return this.prisma.post.findMany({
            where: { organizationId },
            include: { brand: true },
          });
        }

        async paged(organizationId: string) {
          return this.prisma.post.findMany({
            take: 20,
            where: { organizationId },
          });
        }

        async raw(organizationId: string) {
          return this.prisma.$queryRaw\`SELECT * FROM posts WHERE organization_id = \${organizationId}\`;
        }

        async unsafe() {
          return this.prisma.post.updateMany({ data: { status: 'archived' } });
        }
      }
      `,
    );

    const result = runSqlRiskAudit({ rootDir: testDir });
    const categories = result.findings.map((finding) => finding.category);

    expect(categories).toEqual(
      expect.arrayContaining([
        'raw-sql-review',
        'unbounded-read',
        'broad-include',
        'bulk-write-tenant-review',
      ]),
    );
    expect(result.summary.high).toBe(1);
    expect(result.operationCounts).toMatchObject({
      $queryRaw: 1,
      findMany: 2,
      updateMany: 1,
    });
  });

  it('allows reviewed bulk-write suppressions with local rationale', () => {
    writeFixture(
      'apps/server/api/src/auth/cleanup.service.ts',
      `
      export class CleanupService {
        constructor(private readonly prisma: PrismaService) {}

        async cleanup() {
          // sql-risk-audit: ignore bulk-write-tenant-review -- Global TTL cleanup uses expiresAt index and touches no tenant-owned content.
          return this.prisma.desktopAuthCode.deleteMany({
            where: { expiresAt: { lte: new Date() } },
          });
        }
      }
      `,
    );

    const result = runSqlRiskAudit({ rootDir: testDir });

    expect(result.findings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'bulk-write-tenant-review' }),
      ]),
    );
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
