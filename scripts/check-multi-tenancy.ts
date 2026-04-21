/**
 * Database Multi-Tenancy Safety Analyzer
 *
 * Scans NestJS service files for direct model query calls
 * missing `organization` or `isDeleted` filters — the two critical
 * multi-tenancy guards in this codebase.
 *
 * Only flags DIRECT model calls (this.model.find, this.xyzModel.find).
 * Service-level delegation (this.someService.find) goes through
 * BaseService which handles filtering.
 *
 * Usage:
 *   npx tsx scripts/check-multi-tenancy.ts
 *   npx tsx scripts/check-multi-tenancy.ts --json
 *   npx tsx scripts/check-multi-tenancy.ts --files path/to/file.ts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const BASELINE_FILE = 'scripts/multi-tenancy-baseline.json';

// ─── Configuration ──────────────────────────────────────────

const ROOT_DIR = process.cwd();

const SOURCE_GLOBS = [
  'apps/server/**/src/**/*.service.ts',
  'apps/server/**/src/**/*.processor.ts',
];

const IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.spec.ts',
  '**/*.test.ts',
];

/**
 * Model methods that accept a filter/query as first arg.
 */
const QUERY_METHODS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'deleteOne',
  'deleteMany',
  'countDocuments',
  'exists',
  'distinct',
  'replaceOne',
];

const AGGREGATE_METHOD = 'aggregate';

/**
 * Service file path fragments exempt from organization filter.
 * Cron/worker services intentionally query across all tenants.
 * Non-tenant collections don't have organization fields.
 */
const EXEMPT_FROM_ORG_FILTER = [
  // Cron services scan all tenants by design
  '/crons/',
  '/workers/src/services/',
  // Global/system collections (no organization field)
  '/roles/',
  '/models/',
  '/announcements/',
  '/trends/',
  '/ad-insights/',
  '/tracked-links/',
  '/template-metadata/',
  // Base service (provides safe helpers)
  'base.service.ts',
  // Queue processors that delegate to scoped services
  'bull-board',
  // Seed/migration scripts
  '/migrations/',
  '/seeds/',
];

/**
 * Service file path fragments exempt from ALL scanning.
 * These are non-tenant collections or infrastructure code.
 */
const FULLY_EXEMPT = [
  'base.service.ts',
  '/migrations/',
  '/seeds/',
  'bull-board',
  // Non-tenant global collections
  '/roles/',
  '/models/',
  '/announcements/',
  '/ad-insights/',
  '/tracked-links/',
  '/template-metadata/',
  '/trends/',
  // Fanvue chatbot (separate microservice, own tenancy model)
  'apps/server/fanvue/',
];

// ─── Types ──────────────────────────────────────────────────

type Violation = {
  file: string;
  line: number;
  method: string;
  missingFilters: string[];
  snippet: string;
  /** Stable key for baseline comparison (file + method + missing) */
  key: string;
};

type ScanResult = {
  totalFiles: number;
  totalQueries: number;
  violations: Violation[];
};

// ─── Scanner ────────────────────────────────────────────────

function isFullyExempt(filePath: string): boolean {
  return FULLY_EXEMPT.some((pattern) => filePath.includes(pattern));
}

function isExemptFromOrgFilter(filePath: string): boolean {
  return EXEMPT_FROM_ORG_FILTER.some((pattern) => filePath.includes(pattern));
}

/**
 * Detect if a .find() / .findOne() call is on a model-like property
 * (this.model, this.xyzModel, this.someNameModel) vs a JS array
 * or service delegation.
 *
 * Model pattern: `this.model.find(` or `this.someModel.find(`
 * Service pattern: `this.someService.find(` — SKIP (delegated)
 * Array pattern: `items.find(` or `results.find(` — SKIP
 */
function isModelCall(line: string, method: string): boolean {
  // Match: this.model.method( or this.xyzModel.method(
  const modelCallRegex = new RegExp(
    `this\\.(\\w*[Mm]odel)\\s*\\.\\s*${method}\\s*\\(`,
  );
  if (modelCallRegex.test(line)) {
    return true;
  }

  // Match: (this.model as SomeType).method(
  const castModelRegex = new RegExp(
    `\\(this\\.(\\w*[Mm]odel)\\s+as\\s+\\w+\\)\\s*\\.\\s*${method}\\s*\\(`,
  );
  if (castModelRegex.test(line)) {
    return true;
  }

  return false;
}

/**
 * Extract the block of text from a query call site.
 * Captures from the method call through the matching close.
 */
function extractQueryBlock(lines: string[], startLine: number): string {
  let depth = 0;
  let started = false;
  const block: string[] = [];

  for (let i = startLine; i < Math.min(startLine + 40, lines.length); i++) {
    const line = lines[i];
    block.push(line);

    for (const ch of line) {
      if (ch === '(' || ch === '{' || ch === '[') {
        depth++;
        started = true;
      }
      if (ch === ')' || ch === '}' || ch === ']') {
        depth--;
      }
    }

    if (started && depth <= 0) {
      break;
    }
  }

  return block.join('\n');
}

function hasOrganizationFilter(block: string): boolean {
  return (
    /organization\s*:/i.test(block) ||
    /['"]organization['"]/i.test(block) ||
    /organizationId/i.test(block)
  );
}

function hasIsDeletedFilter(block: string): boolean {
  return (
    /isDeleted\s*:/i.test(block) ||
    /['"]isDeleted['"]/i.test(block) ||
    /\$ne.*true/i.test(block)
  );
}

/**
 * Check if the line or surrounding context has a tenancy-safe suppression comment.
 */
function hasSuppression(lines: string[], lineIndex: number): boolean {
  // Check current line and the 2 lines above
  for (let i = Math.max(0, lineIndex - 2); i <= lineIndex; i++) {
    if (/tenancy-safe/i.test(lines[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the query uses _id as the primary filter.
 * Queries by _id are globally unique and safe without org filter.
 */
function hasIdFilter(block: string): boolean {
  return /_id\s*:/i.test(block) || /\$in.*_id/i.test(block);
}

/**
 * Check if the filter argument is a variable (pre-built filter).
 */
function usesVariableFilter(line: string, method: string): boolean {
  const callMatch = new RegExp(
    `\\.${method}\\(\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*[,)]`,
  );
  const match = callMatch.exec(line);
  if (!match) return false;

  const argName = match[1].toLowerCase();
  const filterNames = [
    'filter',
    'filters',
    'query',
    'params',
    'processedparams',
    'match',
    'matchstage',
    'matchfilter',
    'conditions',
    'where',
    'criteria',
    'searchparams',
    'basefilter',
    // Aggregate pipeline variables
    'pipeline',
    'stages',
    'aggregation',
  ];
  return filterNames.some((name) => argName.includes(name));
}

/**
 * Check if an aggregate call uses a pre-built pipeline from
 * a builder pattern or variable constructed earlier.
 */
function usesBuiltPipeline(line: string, block: string): boolean {
  // .aggregate(pipeline) or .aggregate(stages)
  if (/\.aggregate\(\s*[a-zA-Z_]\w*\s*\)/.test(line)) {
    const argMatch = /\.aggregate\(\s*([a-zA-Z_]\w*)\s*\)/.exec(line);
    if (argMatch) {
      const arg = argMatch[1].toLowerCase();
      return ['pipeline', 'stages', 'aggregation', 'pipe', 'aggregate'].some(
        (name) => arg.includes(name),
      );
    }
  }
  // PipelineBuilder or buildMatch pattern in block
  if (/PipelineBuilder/i.test(block) || /buildMatch/i.test(block)) {
    return true;
  }
  // $match stage using a variable (e.g., { $match: matchFilter })
  // The variable was likely built with proper org/isDeleted
  const matchVarRegex = /\$match\s*:\s*([a-zA-Z_]\w*)\s*[,}]/;
  const matchVarResult = matchVarRegex.exec(block);
  if (matchVarResult) {
    const varName = matchVarResult[1].toLowerCase();
    const filterVarNames = [
      'filter',
      'match',
      'stage',
      'criteria',
      'conditions',
      'where',
    ];
    return filterVarNames.some((name) => varName.includes(name));
  }
  return false;
}

function makeViolationKey(
  file: string,
  method: string,
  missingFilters: string[],
  snippet: string,
): string {
  // Use file + method + sorted missing filters + normalized snippet
  // Line numbers shift too easily, so we use content for stability
  const stableSnippet = snippet
    .replace(/\s+/g, '')
    .replace(/['"]/g, '')
    .slice(0, 80);
  return `${file}|${method}|${[...missingFilters].sort().join(',')}|${stableSnippet}`;
}

function scanFile(
  filePath: string,
  exemptFromOrg: boolean,
): { queries: number; violations: Violation[] } {
  const relativePath = path.relative(ROOT_DIR, filePath);
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let queries = 0;
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue;
    }

    // Skip suppressed lines
    if (hasSuppression(lines, i)) {
      continue;
    }

    // ─── Regular query methods ──────────────────────────
    for (const method of QUERY_METHODS) {
      if (!isModelCall(line, method)) {
        continue;
      }

      queries++;
      const block = extractQueryBlock(lines, i);

      // Skip variable-based filters (pre-built elsewhere)
      if (usesVariableFilter(line, method)) {
        continue;
      }

      const missingFilters: string[] = [];

      // Check organization (skip if exempt or _id-based query)
      if (
        !exemptFromOrg &&
        !hasOrganizationFilter(block) &&
        !hasIdFilter(block)
      ) {
        missingFilters.push('organization');
      }

      // Check isDeleted (always required unless _id-based)
      if (!hasIsDeletedFilter(block) && !hasIdFilter(block)) {
        missingFilters.push('isDeleted');
      }

      if (missingFilters.length > 0) {
        const snippet = lines
          .slice(i, Math.min(i + 5, lines.length))
          .map((l) => l.trim())
          .join(' ')
          .slice(0, 140);

        violations.push({
          file: relativePath,
          key: makeViolationKey(relativePath, method, missingFilters, snippet),
          line: i + 1,
          method,
          missingFilters,
          snippet,
        });
      }
    }

    // ─── Aggregate calls ────────────────────────────────
    const aggRegex = /this\.(\w*[Mm]odel)\s*\.\s*aggregate\s*\(/;
    if (aggRegex.test(line)) {
      queries++;

      if (hasSuppression(lines, i)) {
        continue;
      }

      const block = extractQueryBlock(lines, i);

      if (usesVariableFilter(line, AGGREGATE_METHOD)) {
        continue;
      }

      if (usesBuiltPipeline(line, block)) {
        continue;
      }

      const missingFilters: string[] = [];

      if (!exemptFromOrg && !hasOrganizationFilter(block)) {
        missingFilters.push('organization');
      }

      if (!hasIsDeletedFilter(block)) {
        missingFilters.push('isDeleted');
      }

      if (missingFilters.length > 0) {
        const snippet = lines
          .slice(i, Math.min(i + 5, lines.length))
          .map((l) => l.trim())
          .join(' ')
          .slice(0, 140);

        violations.push({
          file: relativePath,
          key: makeViolationKey(
            relativePath,
            AGGREGATE_METHOD,
            missingFilters,
            snippet,
          ),
          line: i + 1,
          method: AGGREGATE_METHOD,
          missingFilters,
          snippet,
        });
      }
    }
  }

  return { queries, violations };
}

// ─── Main ───────────────────────────────────────────────────

function loadBaseline(): Set<string> {
  const baselinePath = path.join(ROOT_DIR, BASELINE_FILE);
  if (!existsSync(baselinePath)) {
    return new Set();
  }
  const data = JSON.parse(readFileSync(baselinePath, 'utf-8'));
  return new Set(data.keys as string[]);
}

function saveBaseline(violations: Violation[]): void {
  const baselinePath = path.join(ROOT_DIR, BASELINE_FILE);
  const keys = violations.map((v) => v.key).sort();
  writeFileSync(
    baselinePath,
    JSON.stringify({ keys, updatedAt: new Date().toISOString() }, null, 2) +
      '\n',
  );
  process.stdout.write(
    `Baseline updated: ${keys.length} known violations saved to ${BASELINE_FILE}\n`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const updateBaseline = args.includes('--update-baseline');
  const filesIndex = args.indexOf('--files');

  let files: string[];

  if (filesIndex !== -1 && args[filesIndex + 1]) {
    files = args.slice(filesIndex + 1).filter((f) => !f.startsWith('--'));
  } else {
    files = SOURCE_GLOBS.flatMap((pattern) =>
      globSync(pattern, {
        absolute: true,
        cwd: ROOT_DIR,
        ignore: IGNORE_GLOBS,
      }),
    );
  }

  const result: ScanResult = {
    totalFiles: 0,
    totalQueries: 0,
    violations: [],
  };

  for (const file of files) {
    const absolutePath = path.isAbsolute(file)
      ? file
      : path.join(ROOT_DIR, file);

    if (isFullyExempt(absolutePath)) {
      continue;
    }

    result.totalFiles++;

    const exemptFromOrg = isExemptFromOrgFilter(absolutePath);
    const { queries, violations } = scanFile(absolutePath, exemptFromOrg);
    result.totalQueries += queries;
    result.violations.push(...violations);
  }

  if (updateBaseline) {
    saveBaseline(result.violations);
    return;
  }

  // Filter out baseline violations
  const baseline = loadBaseline();
  const newViolations = result.violations.filter((v) => !baseline.has(v.key));
  const baselinedCount = result.violations.length - newViolations.length;

  if (jsonOutput) {
    process.stdout.write(
      JSON.stringify(
        { ...result, baselinedCount, violations: newViolations },
        null,
        2,
      ),
    );
    process.stdout.write('\n');
  } else {
    printReport({ ...result, violations: newViolations }, baselinedCount);
  }

  if (newViolations.length > 0) {
    process.exit(1);
  }
}

function printReport(result: ScanResult, baselinedCount: number = 0): void {
  const { totalFiles, totalQueries, violations } = result;

  process.stdout.write('\n');
  process.stdout.write('═══ MongoDB Multi-Tenancy Safety Report ═══\n');
  process.stdout.write('\n');
  process.stdout.write(`  Files scanned:      ${totalFiles}\n`);
  process.stdout.write(`  Model query sites:  ${totalQueries}\n`);
  process.stdout.write(`  New violations:     ${violations.length}\n`);
  if (baselinedCount > 0) {
    process.stdout.write(`  Baselined (known):  ${baselinedCount}\n`);
  }
  process.stdout.write('\n');

  if (violations.length === 0) {
    process.stdout.write('  No new multi-tenancy violations found.\n');
    process.stdout.write('\n');
    return;
  }

  const byFile = new Map<string, Violation[]>();
  for (const v of violations) {
    const existing = byFile.get(v.file) ?? [];
    existing.push(v);
    byFile.set(v.file, existing);
  }

  for (const [file, fileViolations] of byFile) {
    process.stdout.write(`  ${file}\n`);
    for (const v of fileViolations) {
      const missing = v.missingFilters.join(', ');
      process.stdout.write(
        `    L${v.line}: .${v.method}() missing: ${missing}\n`,
      );
      process.stdout.write(`      ${v.snippet}\n`);
      process.stdout.write('\n');
    }
  }

  process.stdout.write(`${'─'.repeat(50)}\n`);
  process.stdout.write(
    `  ${violations.length} violation(s). Fix or suppress before merging.\n`,
  );
  process.stdout.write('\n');
  process.stdout.write('  Suppress false positives:\n');
  process.stdout.write('    // tenancy-safe: <reason>\n');
  process.stdout.write('\n');
}

main();
