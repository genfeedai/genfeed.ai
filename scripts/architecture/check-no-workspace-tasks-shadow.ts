import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const RETIRED_DIRECTORY = 'apps/server/api/src/collections/workspace-tasks';
const RETIRED_IMPORT_PATTERN =
  /(?:@api\/collections\/workspace-tasks|collections\/workspace-tasks)/u;
const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{cjs,js,mjs,ts,tsx}',
  'packages/**/*.{cjs,js,mjs,ts,tsx}',
];
const DEFAULT_IGNORE_GLOBS = [
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

export type WorkspaceTasksShadowViolation =
  | {
      kind: 'retired-directory';
      path: string;
    }
  | {
      file: string;
      kind: 'retired-import';
      line: number;
    };

export type WorkspaceTasksShadowOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

function lineForOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

export function checkNoWorkspaceTasksShadow(
  options: WorkspaceTasksShadowOptions = {},
): WorkspaceTasksShadowViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const violations: WorkspaceTasksShadowViolation[] = [];

  const retiredFiles = globSync(`${RETIRED_DIRECTORY}/**/*`, {
    cwd: rootDir,
    nodir: true,
  });

  if (retiredFiles.length > 0) {
    violations.push({
      kind: 'retired-directory',
      path: RETIRED_DIRECTORY,
    });
  }

  const files = globSync(options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS, {
    cwd: rootDir,
    ignore: options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS,
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));

  for (const file of files) {
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    const match = RETIRED_IMPORT_PATTERN.exec(source);

    if (!match) {
      continue;
    }

    violations.push({
      file: file.replaceAll('\\', '/'),
      kind: 'retired-import',
      line: lineForOffset(source, match.index),
    });
  }

  return violations;
}

if (import.meta.main) {
  const violations = checkNoWorkspaceTasksShadow();

  if (violations.length > 0) {
    console.error('Retired workspace-tasks shadow violations found:');
    for (const violation of violations) {
      if (violation.kind === 'retired-directory') {
        console.error(
          `- ${violation.path}: use the canonical collections/tasks boundary.`,
        );
        continue;
      }

      console.error(
        `- ${violation.file}:${violation.line}: import from collections/tasks instead.`,
      );
    }
    process.exit(1);
  }

  console.log('Retired workspace-tasks shadow guard passed.');
}
