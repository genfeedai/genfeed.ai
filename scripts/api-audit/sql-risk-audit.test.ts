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

  it('allows reviewed raw SQL suppressions with local rationale', () => {
    writeFixture(
      'apps/server/api/src/analytics/analytics.service.ts',
      `
      export class AnalyticsService {
        constructor(private readonly prisma: PrismaService) {}

        async totals(organizationId: string) {
          // sql-risk-audit: ignore raw-sql-review -- Aggregates into one row, uses org/date index, and exposes no raw row payload.
          return this.prisma.$queryRaw\`SELECT count(*) FROM post_analytics WHERE organization_id = \${organizationId}\`;
        }

        async unreviewed(organizationId: string) {
          return this.prisma.$queryRaw\`SELECT * FROM post_analytics WHERE organization_id = \${organizationId}\`;
        }
      }
      `,
    );

    const result = runSqlRiskAudit({ rootDir: testDir });
    const rawSqlFindings = result.findings.filter(
      (finding) => finding.category === 'raw-sql-review',
    );

    expect(rawSqlFindings).toHaveLength(1);
    expect(rawSqlFindings[0]).toMatchObject({
      file: 'apps/server/api/src/analytics/analytics.service.ts',
      method: '$queryRaw',
    });
  });

  it('classifies aggregate/groupBy as bounded aggregate-scan-review, not unbounded-read', () => {
    writeFixture(
      'apps/server/api/src/analytics/analytics.service.ts',
      `
      export class AnalyticsService {
        constructor(private readonly prisma: PrismaService) {}

        async totals(organizationId: string) {
          return this.prisma.postAnalytics.aggregate({
            _sum: { totalViews: true },
            where: { organizationId },
          });
        }

        async byDate(organizationId: string) {
          return this.prisma.postAnalytics.groupBy({
            _avg: { engagementRate: true },
            by: ['date'],
            where: { organizationId },
          });
        }
      }
      `,
    );

    const result = runSqlRiskAudit({ rootDir: testDir });
    const categories = result.findings.map((finding) => finding.category);

    // The migrated SQL-aggregation pattern must not be flagged as an unbounded
    // row read (the pre-fix false positive) and must not raise severity.
    expect(categories).not.toContain('unbounded-read');
    expect(
      result.findings.filter(
        (finding) => finding.category === 'aggregate-scan-review',
      ),
    ).toHaveLength(2);
    expect(
      result.findings.every((finding) => finding.severity !== 'high'),
    ).toBe(true);
    expect(result.summary.high).toBe(0);
  });

  it('allows reviewed aggregate/groupBy suppressions with local rationale', () => {
    writeFixture(
      'apps/server/api/src/analytics/analytics.service.ts',
      `
      export class AnalyticsService {
        constructor(private readonly prisma: PrismaService) {}

        async reviewedByDate(organizationId: string) {
          // sql-risk-audit: ignore aggregate-scan-review -- Group key is index-backed and result cardinality is bounded by platform taxonomy.
          return this.prisma.postAnalytics.groupBy({
            _avg: { engagementRate: true },
            by: ['platform'],
            where: { organizationId },
          });
        }

        async unreviewedByDate(organizationId: string) {
          return this.prisma.postAnalytics.groupBy({
            _avg: { engagementRate: true },
            by: ['date'],
            where: { organizationId },
          });
        }
      }
      `,
    );

    const result = runSqlRiskAudit({ rootDir: testDir });

    expect(
      result.findings.filter(
        (finding) => finding.category === 'aggregate-scan-review',
      ),
    ).toHaveLength(1);
  });
});

function writeFixture(relativePath: string, content: string): void {
  const filePath = path.join(process.cwd(), relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
}
