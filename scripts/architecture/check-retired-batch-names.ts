/**
 * Guardrail: "Batch" is the retired name of the Turbo product (#5936).
 *
 * The rename was a hard cut: tables, routes, API paths, tools, queues, flags
 * and code all say Turbo. This guard fails when a Batch-product identifier,
 * route or tool name returns. Generic batching (bulk writes, provider batch
 * APIs, workflow batch executions, hook-remix job ids) is not the product and
 * is not matched, or is listed in ALLOWED_PATHS.
 *
 *   bun run check:retired-batch-names
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

/** Product names that must not return, with what replaced them. */
export const RETIRED_BATCH_NAMES: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern:
      /\bI?Batch(?:Project|Generation|Rewrite|Content|Idea|Item|Status|Summary|WithConfig|es(?=[A-Z]))\w*/gu,
    replacement: 'Turbo*',
  },
  {
    pattern: /\bbatch(?:Project|Generation|Rewrite|Content|Idea|Item)\w*/gu,
    replacement: 'turbo*',
  },
  {
    pattern: /\bBATCH_(?:PROJECT|GENERATION|REWRITE|CONTENT|IDEA)\w*/gu,
    replacement: 'TURBO_*',
  },
  {
    pattern:
      /\bbatch_(?:projects?|project_items?|items?|ideas|generation\w*)\b/gu,
    replacement: 'turbo_*',
  },
  {
    pattern: /\bbatch-(?:projects?|generation|rewrite|content)\b/gu,
    replacement: 'turbo-*',
  },
  {
    pattern: /\b(?:generate_content_batch|batch_approve_reject)\b/gu,
    replacement: 'generate_turbo_content / review_turbo_items',
  },
  { pattern: /\bstudio_batch\b/gu, replacement: 'studio_turbo' },
  { pattern: /\b(?:studioBatch|StudioBatch)\w*/gu, replacement: 'studioTurbo' },
  { pattern: /\/studio\/batch\b/gu, replacement: '/studio/turbo' },
  {
    pattern: /\b(?:pages|services|interfaces)\/batch(?![-\w])/gu,
    replacement: 'pages/turbo, services/turbo or interfaces/turbo',
  },
  { pattern: /\breviewBatchId\b/gu, replacement: 'reviewTurboRunId' },
  { pattern: /\bbatchId\b/gu, replacement: 'turboRunId' },
  {
    pattern: /\b(?:createManualReviewBatch|getBatchesService)\b/gu,
    replacement: 'createManualReviewTurboRun / getTurboRunsService',
  },
  { pattern: /\bprisma\.batch\b/gu, replacement: 'prisma.turboRun' },
  {
    pattern:
      /\b(?:FROM|JOIN|UPDATE|INTO)\s+"?batch(?:es|_items|_projects|_project_items)\b/giu,
    replacement:
      'turbo_runs / turbo_run_items / turbo_projects / turbo_project_items',
  },
  {
    // Table names use underscores; `turbo-runs` is the API path.
    pattern: /\b(?:FROM|JOIN|UPDATE|INTO)\s+"turbo-[a-z-]+"/giu,
    replacement: 'the underscored turbo_* table name',
  },
];

/**
 * Files that legitimately keep the old names: history (migrations and the
 * tests that pin them), this guard, and generic batching that only shares
 * the word.
 */
export const ALLOWED_PATHS: ReadonlyArray<string> = [
  'packages/prisma/prisma/migrations/',
  'packages/prisma/prisma/batch-item-assignee-migration.test.ts',
  'packages/prisma/prisma/batch-workflow-hard-cut-migration.test.ts',
  'packages/prisma/prisma/hot-path-indexes.test.ts',
  'packages/prisma/prisma/typed-json-hot-columns-migration.test.ts',
  'packages/prisma/prisma/turbo-rename-migration.test.ts',
  'packages/prisma/prisma/workflow-execution-node-results-migration.test.ts',
  'apps/server/api/src/endpoints/v1/hook-remix/',
  'apps/server/files/src/services/hook-remix/',
  'apps/server/workers/src/scheduling/platform-schedules.constants.ts',
  'scripts/api-audit/sql-risk-audit.test.ts',
  'scripts/architecture/check-retired-batch-names.ts',
  'scripts/architecture/check-retired-batch-names.test.ts',
];

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{cjs,js,mjs,ts,tsx,json,http}',
  'packages/**/*.{cjs,js,mjs,ts,tsx,json,prisma}',
  'playwright/**/*.{ts,tsx}',
  'scripts/**/*.{ts,mjs}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/CHANGELOG.md',
];

export type RetiredBatchNameViolation = {
  file: string;
  line: number;
  name: string;
  replacement: string;
};

export type RetiredBatchNameOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function isAllowed(file: string): boolean {
  return ALLOWED_PATHS.some((allowed) => file.startsWith(allowed));
}

export function findRetiredBatchNames(
  file: string,
  source: string,
): RetiredBatchNameViolation[] {
  const violations: RetiredBatchNameViolation[] = [];
  for (const { pattern, replacement } of RETIRED_BATCH_NAMES) {
    for (const match of source.matchAll(pattern)) {
      violations.push({
        file,
        line: lineForOffset(source, match.index),
        name: match[0],
        replacement,
      });
    }
  }
  return violations.sort((left, right) => left.line - right.line);
}

export function checkRetiredBatchNames(
  options: RetiredBatchNameOptions = {},
): RetiredBatchNameViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    dot: false,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  })
    .map(normalizePath)
    .filter((file) => !isAllowed(file))
    .sort((left, right) => left.localeCompare(right));

  return files.flatMap((file) =>
    findRetiredBatchNames(file, readFileSync(path.join(rootDir, file), 'utf8')),
  );
}

if (import.meta.main) {
  const violations = checkRetiredBatchNames();

  if (violations.length > 0) {
    console.error('Retired Batch product names (#5936):');
    for (const violation of violations) {
      console.error(
        `- ${violation.file}:${violation.line}: ${violation.name} is retired; use ${violation.replacement}.`,
      );
    }
    process.exit(1);
  }

  console.log('Retired Batch product name guard passed.');
}
