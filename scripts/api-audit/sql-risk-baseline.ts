/**
 * Shrinking baseline for `bun run audit:api:sql` (#audit: unbounded reads).
 *
 * The audit reports medium-severity findings that are real but too many to fix
 * in one change: `unbounded-read`, `raw-sql-review` and `broad-include`. This
 * module turns them into a ratchet. Each finding is counted per
 * `category + file + target`, where the target is the Prisma model of an
 * unbounded read. A line number is not part of the key, so editing around a
 * baselined call stays green.
 *
 * - A count above the baseline fails: the PR added a finding. Bound the read
 *   (take/cursor, or an `id: { in }` lookup), or justify it in place with
 *   `// sql-risk-audit: ignore <category> -- <reason>`.
 * - A count below the baseline fails too, so the baseline shrinks with the
 *   code: run `bun run audit:api:sql:baseline` and commit the smaller file.
 *
 * `check:ratchet-growth` compares this file with the base commit, so a PR
 * cannot go green by raising its own count.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SqlRiskFinding } from './sql-risk-audit';

export const SQL_RISK_BASELINE_PATH =
  'scripts/api-audit/sql-risk-baseline.json';

export const BASELINED_CATEGORIES: readonly string[] = [
  'broad-include',
  'raw-sql-review',
  'unbounded-read',
];

export interface SqlRiskBaselineEntry {
  category: string;
  count: number;
  file: string;
  /** Table growth class for an `unbounded-read`; informational. */
  growth?: string;
  /** Prisma model for an `unbounded-read`, `-` for the other categories. */
  target: string;
}

export interface SqlRiskBaseline {
  entries: SqlRiskBaselineEntry[];
}

export interface SqlRiskBaselineViolation {
  baselined: number;
  current: number;
  key: string;
  kind: 'grew' | 'shrank';
}

export function baselineTarget(finding: SqlRiskFinding): string {
  if (finding.category !== 'unbounded-read') {
    return '-';
  }

  return finding.model ?? 'delegate';
}

function entryKey(
  entry: Pick<SqlRiskBaselineEntry, 'category' | 'file' | 'target'>,
): string {
  return `${entry.category} ${entry.file} ${entry.target}`;
}

export function buildSqlRiskBaseline(
  findings: readonly SqlRiskFinding[],
): SqlRiskBaseline {
  const entries = new Map<string, SqlRiskBaselineEntry>();

  for (const finding of findings) {
    if (!BASELINED_CATEGORIES.includes(finding.category)) {
      continue;
    }

    const entry: SqlRiskBaselineEntry = {
      category: finding.category,
      count: 1,
      file: finding.file,
      ...(finding.growth ? { growth: finding.growth } : {}),
      target: baselineTarget(finding),
    };
    const existing = entries.get(entryKey(entry));
    if (existing) {
      existing.count += 1;
    } else {
      entries.set(entryKey(entry), entry);
    }
  }

  return {
    entries: [...entries.values()].sort((left, right) =>
      entryKey(left).localeCompare(entryKey(right)),
    ),
  };
}

export function compareSqlRiskBaseline(
  findings: readonly SqlRiskFinding[],
  baseline: SqlRiskBaseline,
): SqlRiskBaselineViolation[] {
  const current = new Map(
    buildSqlRiskBaseline(findings).entries.map((entry) => [
      entryKey(entry),
      entry.count,
    ]),
  );
  const baselined = new Map(
    baseline.entries.map((entry) => [entryKey(entry), entry.count]),
  );
  const violations: SqlRiskBaselineViolation[] = [];

  for (const key of new Set([...current.keys(), ...baselined.keys()])) {
    const currentCount = current.get(key) ?? 0;
    const baselinedCount = baselined.get(key) ?? 0;
    if (currentCount === baselinedCount) {
      continue;
    }

    violations.push({
      baselined: baselinedCount,
      current: currentCount,
      key,
      kind: currentCount > baselinedCount ? 'grew' : 'shrank',
    });
  }

  return violations.sort((left, right) => left.key.localeCompare(right.key));
}

export function formatSqlRiskBaselineViolations(
  violations: readonly SqlRiskBaselineViolation[],
): string {
  const lines = violations.map((violation) => {
    const [category, file, target] = violation.key.split(' ');
    const verb =
      violation.kind === 'grew'
        ? 'new finding, bound it or justify it in place'
        : 'fixed, run `bun run audit:api:sql:baseline` to shrink the baseline';
    return `  - ${category} ${file} (${target}): ${violation.baselined} -> ${violation.current}, ${verb}`;
  });

  return `SQL risk baseline out of date (${violations.length}):\n${lines.join('\n')}\n`;
}

export function readSqlRiskBaseline(rootDir: string): SqlRiskBaseline {
  return JSON.parse(
    readFileSync(path.join(rootDir, SQL_RISK_BASELINE_PATH), 'utf8'),
  ) as SqlRiskBaseline;
}

export function writeSqlRiskBaseline(
  rootDir: string,
  baseline: SqlRiskBaseline,
): void {
  writeFileSync(
    path.join(rootDir, SQL_RISK_BASELINE_PATH),
    `${JSON.stringify(baseline, null, 2)}\n`,
    'utf8',
  );
}
