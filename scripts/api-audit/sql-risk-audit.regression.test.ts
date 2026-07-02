import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runSqlRiskAudit } from './sql-risk-audit';

// Repo root is two levels up from scripts/api-audit/.
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

// Regression gate over the real API source. The bulk-write tenant-scoping work
// (PR #647, refs #632) cleared every high-severity finding; this test fails the
// build if a new unguarded bulk write or unsafe raw-SQL call reintroduces one,
// so the audit's manual pass is enforced rather than left to rot.
describe('sql risk audit — real codebase regression gate', () => {
  const result = runSqlRiskAudit({ rootDir: REPO_ROOT });

  it('scans the API source tree', () => {
    expect(result.filesScanned).toBeGreaterThan(0);
  });

  it('has zero high-severity findings', () => {
    const highFindings = result.findings.filter(
      (finding) => finding.severity === 'high',
    );
    expect(
      highFindings,
      `Unexpected high-severity SQL risk findings:\n${highFindings
        .map(
          (finding) =>
            `  - ${finding.category} ${finding.file}:${finding.line}`,
        )
        .join('\n')}`,
    ).toHaveLength(0);
  });

  it('has zero unguarded bulk-write findings', () => {
    const bulkWriteFindings = result.findings.filter(
      (finding) => finding.category === 'bulk-write-tenant-review',
    );
    expect(
      bulkWriteFindings,
      `Bulk writes missing a tenant/user/isDeleted guard or documented suppression:\n${bulkWriteFindings
        .map(
          (finding) =>
            `  - ${finding.file}:${finding.line} (${finding.method})`,
        )
        .join('\n')}`,
    ).toHaveLength(0);
  });

  it('does not report reviewed trend reference corpus lookup queries', () => {
    const trendReferenceCorpusFindings = result.findings.filter(
      (finding) =>
        finding.file ===
        'apps/server/api/src/collections/trends/services/trend-reference-corpus.service.ts',
    );

    expect(
      trendReferenceCorpusFindings,
      `Trend reference corpus findings should stay documented at the query site and EXPLAIN harness:\n${trendReferenceCorpusFindings
        .map(
          (finding) =>
            `  - ${finding.category} ${finding.file}:${finding.line}`,
        )
        .join('\n')}`,
    ).toHaveLength(0);
  });
});
