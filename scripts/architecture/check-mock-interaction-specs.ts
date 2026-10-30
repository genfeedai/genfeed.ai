import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { MOCK_INTERACTION_SPEC_BASELINE } from './mock-interaction-specs.baseline';

/**
 * Specs must not be mostly mock-interaction assertions.
 *
 * A spec whose assertions are mainly `toHaveBeenCalled*` checks only proves
 * the code under test calls its collaborators the way it is written today. It
 * passes against a wrong implementation and breaks on a correct refactor.
 * Prefer a real-DB test, a property test, or a Playwright flow, and assert on
 * the returned or persisted result instead.
 *
 * A file counts as mock-interaction-heavy when it has at least
 * `MIN_ASSERTION_COUNT` `expect(` calls and more than half of them end in a
 * `toHaveBeenCalled*` matcher. Files that already do are ratcheted in
 * `mock-interaction-specs.baseline.ts`: no new file may join the list, and an
 * entry that no longer qualifies (or whose file is gone) must be removed, so the
 * list only shrinks.
 */

export const MIN_ASSERTION_COUNT = 5;

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{spec,test}.{ts,tsx}',
  'packages/**/*.{spec,test}.{ts,tsx}',
  'scripts/**/*.{spec,test}.{ts,tsx}',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/generated/**',
];

const ASSERTION_PATTERN = /\bexpect\(/gu;

const MOCK_INTERACTION_PATTERN =
  /\.(?:toHaveBeenCalled|toHaveBeenCalledTimes|toHaveBeenCalledWith|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith|toBeCalled|toBeCalledTimes|toBeCalledWith)\(/gu;

export type MockInteractionSpecViolation = {
  assertionCount: number;
  file: string;
  kind: 'new-mock-heavy-spec' | 'stale-baseline';
  message: string;
  mockInteractionCount: number;
};

export type MockInteractionSpecOptions = {
  baseline?: readonly string[];
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export function isMockInteractionHeavy(source: string): {
  assertionCount: number;
  isHeavy: boolean;
  mockInteractionCount: number;
} {
  const assertionCount = [...source.matchAll(ASSERTION_PATTERN)].length;
  const mockInteractionCount = [...source.matchAll(MOCK_INTERACTION_PATTERN)]
    .length;
  return {
    assertionCount,
    isHeavy:
      assertionCount >= MIN_ASSERTION_COUNT &&
      mockInteractionCount * 2 > assertionCount,
    mockInteractionCount,
  };
}

function normalizePath(file: string): string {
  return file.replaceAll('\\', '/');
}

export function runCheckMockInteractionSpecs(
  options: MockInteractionSpecOptions = {},
): {
  heavyFiles: string[];
  scannedFileCount: number;
  violations: MockInteractionSpecViolation[];
} {
  const rootDir = options.rootDir ?? process.cwd();
  const baseline = new Set(options.baseline ?? MOCK_INTERACTION_SPEC_BASELINE);
  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort();

  const heavyFiles: string[] = [];
  const violations: MockInteractionSpecViolation[] = [];

  for (const filePath of files) {
    const file = normalizePath(path.relative(rootDir, filePath));
    const result = isMockInteractionHeavy(readFileSync(filePath, 'utf8'));
    if (!result.isHeavy) {
      if (baseline.has(file)) {
        violations.push({
          assertionCount: result.assertionCount,
          file,
          kind: 'stale-baseline',
          message:
            'No longer mock-interaction-heavy. Remove the entry from mock-interaction-specs.baseline.ts.',
          mockInteractionCount: result.mockInteractionCount,
        });
      }
      continue;
    }
    heavyFiles.push(file);
    if (!baseline.has(file)) {
      violations.push({
        assertionCount: result.assertionCount,
        file,
        kind: 'new-mock-heavy-spec',
        message:
          'More than half of the assertions are toHaveBeenCalled* checks. Assert on the returned or persisted result instead: use a real-DB test, a property test, or a Playwright flow.',
        mockInteractionCount: result.mockInteractionCount,
      });
    }
  }

  const scanned = new Set(
    files.map((filePath) => normalizePath(path.relative(rootDir, filePath))),
  );
  for (const file of baseline) {
    if (!scanned.has(file)) {
      violations.push({
        assertionCount: 0,
        file,
        kind: 'stale-baseline',
        message:
          'File no longer exists. Remove the entry from mock-interaction-specs.baseline.ts.',
        mockInteractionCount: 0,
      });
    }
  }

  return { heavyFiles, scannedFileCount: files.length, violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckMockInteractionSpecs();

  if (result.violations.length > 0) {
    console.error('Mock-interaction spec violations found:');
    for (const violation of result.violations) {
      console.error(
        `- ${violation.file} (${violation.mockInteractionCount}/${violation.assertionCount} assertions) — ${violation.message}`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Mock-interaction spec guard passed: ${result.heavyFiles.length} baselined spec(s) across ${result.scannedFileCount} scanned file(s).`,
  );
}
