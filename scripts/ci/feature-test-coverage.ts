import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export interface ChangedFile {
  path: string;
  status: string;
}

export interface FeatureTestCoverageResult {
  applicable: boolean;
  passed: boolean;
  productionFiles: string[];
  reason: string;
  testFiles: string[];
}

const TEST_BEARING_PR_TITLE = /^(?:feat|fix|refactor)(?:\([^)]+\))?[!:]/iu;
const RUNTIME_SOURCE_FILE = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/u;
const RUNTIME_ROOT = /^(?:apps|ee|packages|scripts)\//u;
const TEST_FILE =
  /(?:^|\/)(?:__tests__|e2e|test|tests)(?:\/|$)|\.(?:e2e-)?(?:spec|test)\.(?:cjs|js|jsx|mjs|ts|tsx)$/u;
const NON_RUNTIME_SOURCE =
  /(?:^|\/)(?:dist|generated|node_modules)(?:\/|$)|\.d\.ts$|(?:^|\/)(?:next|playwright|vitest)\.config\.[cm]?[jt]s$/u;

export function parseChangedFiles(output: string): ChangedFile[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = line.split('\t');
      const status = columns[0] ?? '';
      const path = columns.at(-1) ?? '';

      return { path, status };
    });
}

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

export function isProductionSourceFile(path: string): boolean {
  return (
    RUNTIME_ROOT.test(path) &&
    RUNTIME_SOURCE_FILE.test(path) &&
    !TEST_FILE.test(path) &&
    !NON_RUNTIME_SOURCE.test(path)
  );
}

export function evaluateFeatureTestCoverage(
  title: string,
  changedFiles: ChangedFile[],
): FeatureTestCoverageResult {
  const applicable = TEST_BEARING_PR_TITLE.test(title.trim());
  const productionFiles = changedFiles
    .filter((file) => isProductionSourceFile(file.path))
    .map((file) => file.path)
    .sort();
  const testFiles = changedFiles
    .filter((file) => file.status !== 'D' && isTestFile(file.path))
    .map((file) => file.path)
    .sort();

  if (!applicable) {
    return {
      applicable,
      passed: true,
      productionFiles,
      reason: 'PR title is outside feat/fix/refactor test enforcement.',
      testFiles,
    };
  }

  if (productionFiles.length === 0) {
    return {
      applicable,
      passed: true,
      productionFiles,
      reason: 'No production source files changed.',
      testFiles,
    };
  }

  if (testFiles.length === 0) {
    return {
      applicable,
      passed: false,
      productionFiles,
      reason:
        'Feature, fix, and refactor PRs that change production source must add or update a test file.',
      testFiles,
    };
  }

  return {
    applicable,
    passed: true,
    productionFiles,
    reason: 'Production source changes include test coverage changes.',
    testFiles,
  };
}

export function formatFeatureTestCoverage(
  result: FeatureTestCoverageResult,
): string {
  const lines = [
    '# Feature Test Coverage',
    '',
    `- Applicable: ${result.applicable ? 'yes' : 'no'}`,
    `- Result: ${result.passed ? 'pass' : 'fail'}`,
    `- Production files: ${result.productionFiles.length}`,
    `- Test files: ${result.testFiles.length}`,
    `- Reason: ${result.reason}`,
  ];

  if (!result.passed) {
    lines.push('', 'Production files requiring coverage:');
    lines.push(...result.productionFiles.map((path) => `- \`${path}\``));
  }

  return `${lines.join('\n')}\n`;
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function runCli(): void {
  const base = readOption('--base');
  const title = process.env.PR_TITLE ?? '';

  if (!base) {
    throw new Error('--base is required');
  }

  if (!title) {
    throw new Error('PR_TITLE is required');
  }

  const diff = execFileSync(
    'git',
    ['diff', '--name-status', '--diff-filter=ACMR', base, 'HEAD'],
    { encoding: 'utf8' },
  );
  const result = evaluateFeatureTestCoverage(title, parseChangedFiles(diff));

  process.stdout.write(formatFeatureTestCoverage(result));
  if (!result.passed) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
