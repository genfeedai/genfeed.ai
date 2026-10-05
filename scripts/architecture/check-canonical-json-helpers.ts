/**
 * Guard against new local stable-stringify / canonical-JSON helpers (#5912).
 *
 * Canonical JSON feeds persisted integrity hashes, idempotency keys and
 * logical-write keys, so copies that disagree on edge cases silently break
 * those hashes. Use `stableStringify` / `sha256Hex` from
 * `@libs/utils/canonical-hash.util` (or `stableStringify` from
 * `@genfeedai/contracts/constants/canonical-json.constant` where libs is not a dependency). Files that legitimately keep their own
 * implementation are listed below with the reason; a stale entry also fails.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

// The canonical implementation lives in contracts so packages that cannot
// depend on libs (e.g. @genfeedai/actions) share it; libs re-exports it.
const SHARED_HELPER_FILES = new Set([
  'packages/contracts/src/constants/canonical-json.constant.ts',
  'packages/libs/utils/canonical-hash.util.ts',
]);

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{ts,tsx}',
  'packages/**/*.{ts,tsx}',
  'scripts/**/*.{ts,tsx}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.*',
  '**/*.test.*',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

export type CanonicalJsonAllowance = {
  file: string;
  reason: string;
};

export type CanonicalJsonOccurrence = {
  file: string;
  line: number;
  match: string;
};

export type CanonicalJsonViolation =
  | {
      kind: 'local-canonicalizer';
      message: string;
      occurrence: CanonicalJsonOccurrence;
    }
  | {
      allowance: CanonicalJsonAllowance;
      kind: 'stale-allowance';
      message: string;
    };

export type CanonicalJsonOptions = {
  allowances?: readonly CanonicalJsonAllowance[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export const CANONICAL_JSON_ALLOWANCES: CanonicalJsonAllowance[] = [
  {
    file: 'apps/server/api/src/agent-artifacts/agent-artifact-material.util.ts',
    reason:
      'Different algorithm (normalizeForDigest + JSON.stringify), pinned by stored artifact content digests.',
  },
  {
    file: 'apps/app/src/lib/studio-editor/editor-save-outbox.ts',
    reason:
      'Different algorithm (sortKeysDeep returns a sorted object, not a string); browser-side comparison only, never hashed.',
  },
  {
    file: 'apps/server/api/src/helpers/utils/openapi/openapi-document.util.ts',
    reason:
      'Sorts OpenAPI document keys for deterministic output; not an integrity hash input.',
  },
  {
    file: 'apps/server/api/src/cache/redis/redis-cache.interceptor.ts',
    reason:
      'Sorts request query params for a Redis cache key; ephemeral cache identity, not a persisted integrity or idempotency hash.',
  },
  {
    file: 'scripts/content-eval/provenance.ts',
    reason:
      'Offline eval-provenance script outside the server runtime; its own pinned format.',
  },
];

const DECLARATION_PATTERN =
  /(?:\bfunction\s+|\b(?:const|let)\s+)(stableStringify\w*|canonicalize|canonicalJson\w*|canonicalStringify\w*|sortKeysDeep|sortKeysRecursive\w*|sortObjectKeys)\b/gu;

// Key-sort signatures. Sorted own keys that are mapped/reduced into a
// JSON.stringify'd string, or sorted keys rebuilt into an object via reduce,
// regardless of the helper's name. Object.fromEntries(entries.sort()) is not
// flagged: it is a common non-canonical report-sorting idiom.
const KEY_SORT_SIGNATURE_PATTERNS = [
  /Object\.keys\([^)]*\)\s*\.sort\([^)]*\)\s*\.(?:map|reduce|forEach)\s*(?:<[^(]{0,160})?\([\s\S]{0,240}?JSON\.stringify\(/gu,
  /Object\.keys\([^)]*\)\s*\.sort\([^)]*\)\s*\.reduce\s*(?:<[^(]{0,160})?\(/gu,
];

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function collectOccurrences(
  filePath: string,
  rootDir: string,
): CanonicalJsonOccurrence[] {
  const source = readFileSync(filePath, 'utf8');
  const file = normalizePath(path.relative(rootDir, filePath));

  return [DECLARATION_PATTERN, ...KEY_SORT_SIGNATURE_PATTERNS]
    .flatMap((pattern) =>
      [...source.matchAll(pattern)].map((match) => ({
        file,
        line: lineForOffset(source, match.index),
        match: match[0].replace(/\s+/g, ' ').slice(0, 80),
      })),
    )
    .sort((left, right) => left.line - right.line);
}

export function runCheckCanonicalJsonHelpers(
  options: CanonicalJsonOptions = {},
): {
  scannedFileCount: number;
  violations: CanonicalJsonViolation[];
} {
  const rootDir = options.rootDir ?? process.cwd();
  const allowances = options.allowances ?? CANONICAL_JSON_ALLOWANCES;
  const allowed = new Set(allowances.map((entry) => normalizePath(entry.file)));
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort();
  const violations: CanonicalJsonViolation[] = [];
  const filesWithMatches = new Set<string>();

  for (const filePath of files) {
    const occurrences = collectOccurrences(filePath, rootDir);
    if (occurrences.length === 0) {
      continue;
    }
    const { file } = occurrences[0];
    filesWithMatches.add(file);
    if (SHARED_HELPER_FILES.has(file) || allowed.has(file)) {
      continue;
    }
    violations.push({
      kind: 'local-canonicalizer',
      message:
        'Use stableStringify/sha256Hex from @libs/utils/canonical-hash.util instead of a local canonical-JSON helper.',
      occurrence: occurrences[0],
    });
  }

  for (const allowance of allowances) {
    if (!filesWithMatches.has(normalizePath(allowance.file))) {
      violations.push({
        allowance,
        kind: 'stale-allowance',
        message:
          'No local canonical-JSON helper found in this file any more. Remove the allowance.',
      });
    }
  }

  return { scannedFileCount: files.length, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckCanonicalJsonHelpers();

  if (result.violations.length > 0) {
    console.error('Canonical JSON helper guard violations found:');
    for (const violation of result.violations) {
      if (violation.kind === 'local-canonicalizer') {
        const { occurrence } = violation;
        console.error(
          `- ${occurrence.file}:${occurrence.line} ${occurrence.match} — ${violation.message}`,
        );
      } else {
        console.error(`- ${violation.allowance.file} — ${violation.message}`);
      }
    }
    process.exit(1);
  }

  console.log(
    `Canonical JSON helper guard passed across ${result.scannedFileCount} source file(s).`,
  );
}
