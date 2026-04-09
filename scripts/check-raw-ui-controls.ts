import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { globSync } from 'glob';

const logger = new Logger('CheckRawUiControls');

const INCLUDE_GLOBS = [
  'apps/app/**/*.{tsx,jsx}',
  'packages/pages/**/*.{tsx,jsx}',
  'packages/ui/workflow-builder/**/*.{tsx,jsx}',
];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/dist/**',
];

const LEGACY_IMPORT_PATTERNS = [
  /@ui\/inputs\/input\/Input/g,
  /@ui\/inputs\/select\/Select/g,
];
const RAW_INPUT_PATTERN = /<input\b[\s\S]*?>/g;
const RAW_SELECT_PATTERN = /<select\b[\s\S]*?>/g;
const ALLOWED_RAW_INPUT_PATTERNS = [/type=["']hidden["']/, /type=["']file["']/];

type Violation = {
  file: string;
  line: number;
  kind: 'legacy-import' | 'raw-input' | 'raw-select';
};

export function runCheckRawUiControls(): { violations: Violation[] } {
  const rootDir = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const relativeFilePath = path.relative(rootDir, filePath);

    for (const pattern of LEGACY_IMPORT_PATTERNS) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches) {
        const index = match.index ?? 0;
        violations.push({
          file: relativeFilePath,
          kind: 'legacy-import',
          line: content.slice(0, index).split('\n').length,
        });
      }
    }

    for (const match of content.matchAll(RAW_INPUT_PATTERN)) {
      const rawInput = match[0];
      if (
        ALLOWED_RAW_INPUT_PATTERNS.some((pattern) => pattern.test(rawInput))
      ) {
        continue;
      }

      const index = match.index ?? 0;
      violations.push({
        file: relativeFilePath,
        kind: 'raw-input',
        line: content.slice(0, index).split('\n').length,
      });
    }

    for (const match of content.matchAll(RAW_SELECT_PATTERN)) {
      const index = match.index ?? 0;
      violations.push({
        file: relativeFilePath,
        kind: 'raw-select',
        line: content.slice(0, index).split('\n').length,
      });
    }
  }

  return { violations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckRawUiControls();

  if (violations.length > 0) {
    logger.error(
      'Legacy form imports or raw input/select controls found in guarded UI surfaces. Use shared primitives and approved native exceptions only.',
    );
    for (const violation of violations) {
      logger.error(`- [${violation.kind}] ${violation.file}:${violation.line}`);
    }
    process.exit(1);
  }

  logger.log(
    'No legacy form imports or disallowed raw input/select controls found.',
  );
}
