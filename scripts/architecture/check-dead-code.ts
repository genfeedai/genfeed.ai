/**
 * Dead-code ratchet (#5064).
 *
 * `knip` finds unused files, unused exports and types, and unused manifest
 * dependencies. This check runs it and compares the result with
 * `dead-code.baseline.json`:
 *
 * - Unused files are a floor of zero. A file nothing imports is deleted, or
 *   the file is declared as an entry in `knip.config.ts` with the tool that
 *   loads it.
 * - Unused exports, unused types and unused dependencies are a shrinking
 *   ratchet. A file may not gain unused exports, a new file may not start with
 *   any, and a manifest may not gain an unused dependency.
 * - A baseline entry that no longer matches (the exports were removed, the
 *   dependency was dropped) must be pruned in the same PR, so the list only
 *   shrinks. `check:ratchet-growth` fails a PR that appends to the baseline.
 *
 *   bun run check:dead-code
 *   bun run check:dead-code --update-baseline
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const KNIP_VERSION = '6.44.1';

export type KnipIssueRow = {
  dependencies?: Array<{ name: string }>;
  devDependencies?: Array<{ name: string }>;
  exports?: unknown[];
  file: string;
  files?: unknown[];
  types?: unknown[];
};

export type KnipReport = { issues: KnipIssueRow[] };

/** What the baseline records. Files are always empty: the floor is zero. */
export type DeadCodeSnapshot = {
  /** `<manifest>|<dependency name>` for every unused dependency. */
  unusedDependencies: string[];
  /** Unused exports plus unused types, per file. */
  unusedExports: Record<string, number>;
  unusedFiles: string[];
};

export type DeadCodeViolation = {
  kind: 'dependency' | 'export' | 'file';
  message: string;
  type: 'growth' | 'new' | 'stale';
};

const ROOT = path.resolve(import.meta.dirname, '../..');
const BASELINE_PATH = path.join(
  ROOT,
  'scripts/architecture/dead-code.baseline.json',
);

export function snapshotFromKnip(report: KnipReport): DeadCodeSnapshot {
  const unusedFiles: string[] = [];
  const unusedExports: Record<string, number> = {};
  const unusedDependencies: string[] = [];

  for (const row of report.issues) {
    if ((row.files?.length ?? 0) > 0) {
      unusedFiles.push(row.file);
    }

    const exportCount = (row.exports?.length ?? 0) + (row.types?.length ?? 0);

    if (exportCount > 0) {
      unusedExports[row.file] = exportCount;
    }

    for (const dependency of [
      ...(row.dependencies ?? []),
      ...(row.devDependencies ?? []),
    ]) {
      unusedDependencies.push(`${row.file}|${dependency.name}`);
    }
  }

  return {
    unusedDependencies: unusedDependencies.sort(),
    unusedExports: Object.fromEntries(
      Object.entries(unusedExports).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    unusedFiles: unusedFiles.sort(),
  };
}

export function evaluateDeadCode(
  baseline: DeadCodeSnapshot,
  actual: DeadCodeSnapshot,
): DeadCodeViolation[] {
  const violations: DeadCodeViolation[] = [];
  const baselineFiles = new Set(baseline.unusedFiles);
  const actualFiles = new Set(actual.unusedFiles);

  for (const file of actual.unusedFiles) {
    if (!baselineFiles.has(file)) {
      violations.push({
        kind: 'file',
        message: `${file}: nothing imports this file. Delete it, or declare it as an entry in knip.config.ts with the tool that loads it.`,
        type: 'new',
      });
    }
  }

  for (const file of baseline.unusedFiles) {
    if (!actualFiles.has(file)) {
      violations.push({
        kind: 'file',
        message: `${file}: baselined as unused but it is used or gone. Prune the baseline entry.`,
        type: 'stale',
      });
    }
  }

  for (const [file, count] of Object.entries(actual.unusedExports)) {
    const allowed = baseline.unusedExports[file];

    if (allowed === undefined) {
      violations.push({
        kind: 'export',
        message: `${file}: ${count} unused export(s) (was 0). Remove them.`,
        type: 'new',
      });
    } else if (count > allowed) {
      violations.push({
        kind: 'export',
        message: `${file}: ${count} unused export(s) > baseline ${allowed}. Remove the new ones.`,
        type: 'growth',
      });
    } else if (count < allowed) {
      violations.push({
        kind: 'export',
        message: `${file}: baseline ${allowed} but only ${count} remain. Prune the baseline.`,
        type: 'stale',
      });
    }
  }

  for (const file of Object.keys(baseline.unusedExports)) {
    if (actual.unusedExports[file] === undefined) {
      violations.push({
        kind: 'export',
        message: `${file}: baselined with unused exports but none remain. Prune the baseline entry.`,
        type: 'stale',
      });
    }
  }

  const baselineDependencies = new Set(baseline.unusedDependencies);
  const actualDependencies = new Set(actual.unusedDependencies);

  for (const entry of actual.unusedDependencies) {
    if (!baselineDependencies.has(entry)) {
      const [manifest, name] = entry.split('|');
      violations.push({
        kind: 'dependency',
        message: `${manifest}: unused dependency ${name}. Remove it from the manifest.`,
        type: 'new',
      });
    }
  }

  for (const entry of baseline.unusedDependencies) {
    if (!actualDependencies.has(entry)) {
      const [manifest, name] = entry.split('|');
      violations.push({
        kind: 'dependency',
        message: `${manifest}: ${name} is baselined as unused but is used or gone. Prune the baseline entry.`,
        type: 'stale',
      });
    }
  }

  return violations;
}

export function formatDeadCodeSummary(
  actual: DeadCodeSnapshot,
  violations: readonly DeadCodeViolation[],
): string {
  const exportTotal = Object.values(actual.unusedExports).reduce(
    (sum, count) => sum + count,
    0,
  );
  let output = `Dead-code ratchet: ${actual.unusedFiles.length} unused file(s), ${exportTotal} unused export(s) across ${Object.keys(actual.unusedExports).length} file(s), ${actual.unusedDependencies.length} unused dependenc(ies).\n`;

  if (violations.length === 0) {
    return output;
  }

  output += '\n';

  for (const violation of violations) {
    output += `  [${violation.type.toUpperCase()} ${violation.kind}] ${violation.message}\n`;
  }

  if (violations.some((violation) => violation.type === 'stale')) {
    output +=
      '\nAfter a cleanup, shrink the baseline: bun run check:dead-code --update-baseline\n';
  }

  return output;
}

export function readBaseline(): DeadCodeSnapshot {
  const parsed = JSON.parse(
    readFileSync(BASELINE_PATH, 'utf8'),
  ) as Partial<DeadCodeSnapshot>;

  return {
    unusedDependencies: parsed.unusedDependencies ?? [],
    unusedExports: parsed.unusedExports ?? {},
    unusedFiles: parsed.unusedFiles ?? [],
  };
}

function writeBaseline(snapshot: DeadCodeSnapshot): void {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
}

function runKnip(): KnipReport {
  let stdout: string;

  try {
    stdout = execFileSync(
      'bunx',
      [`knip@${KNIP_VERSION}`, '--reporter', 'json'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  } catch (error) {
    // knip exits 1 whenever it reports issues; the report is still on stdout.
    stdout = String((error as { stdout?: unknown }).stdout ?? '');
  }

  try {
    return JSON.parse(stdout) as KnipReport;
  } catch {
    throw new Error(
      `knip@${KNIP_VERSION} did not print a JSON report. Run \`bunx knip@${KNIP_VERSION} --reporter json\` to see why.`,
    );
  }
}

function main(): void {
  const actual = snapshotFromKnip(runKnip());

  if (process.argv.includes('--update-baseline')) {
    writeBaseline(actual);
    process.stdout.write(
      `Updated dead-code baseline (${actual.unusedFiles.length} files, ${Object.keys(actual.unusedExports).length} files with unused exports, ${actual.unusedDependencies.length} dependencies).\n`,
    );
    return;
  }

  const violations = evaluateDeadCode(readBaseline(), actual);

  process.stdout.write(formatDeadCodeSummary(actual, violations));

  if (violations.length > 0) {
    process.exit(1);
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  main();
}
