/**
 * Guardrail: "core" is a retired name (#4348).
 *
 * It meant three different things across the project's history, so no new
 * package or directory may be named `core`. The shared server tree is
 * `apps/server/api` (`@genfeedai/api`, alias `@api/*`); the #1090
 * `@genfeedai/server` extraction was folded back into it. Workflow code lives
 * in `packages/workflows` (subpath exports `/contracts`, `/engine`,
 * `/generation`, `/nodes`, `/ui`).
 *
 * The guard fails on:
 * - a retired package directory that holds source again;
 * - a workspace manifest named after a retired package;
 * - an import, dependency or path alias naming a retired package or `@server/*`;
 * - a `core` directory outside the fixed list that predates this guard.
 *
 *   bun run check:retired-core-names
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

export const RETIRED_DIRECTORIES = [
  'apps/server/server',
  'packages/core',
  'packages/workflow-engine',
  'packages/workflow-saas',
  'packages/workflow-ui',
] as const;

export const RETIRED_PACKAGE_NAMES = [
  '@genfeedai/core',
  '@genfeedai/server',
  '@genfeedai/workflow-engine',
  '@genfeedai/workflow-saas',
  '@genfeedai/workflow-ui',
] as const;

/** `core` directories that predate the rule. The list may only shrink. */
export const EXISTING_CORE_DIRECTORIES: ReadonlySet<string> = new Set([
  'apps/docs/content/core',
  'apps/server/api/src/endpoints/core',
  'apps/server/api/src/queues/core',
  'packages/client/src/schemas/core',
  'packages/contracts/src/interfaces/core',
  'packages/services/core',
  'packages/ui/src/core',
  'playwright/e2e/tests/core',
]);

const RETIRED_SPECIFIER_PATTERN =
  /(['"])(@genfeedai\/(?:core|server|workflow-engine|workflow-saas|workflow-ui)|@server)(?:\/[^'"\n]*)?\1/gu;

const MANIFEST_NAME_KEY_PATTERN = /"name"\s*:\s*$/u;

const DEFAULT_INCLUDE_GLOBS = [
  'apps/**/*.{cjs,js,mjs,ts,tsx}',
  'packages/**/*.{cjs,js,mjs,ts,tsx}',
  'apps/**/{package,tsconfig*}.json',
  'packages/**/{package,tsconfig*}.json',
  'package.json',
  'tsconfig*.json',
];

const CORE_DIRECTORY_ROOTS = ['apps', 'packages', 'playwright'] as const;

const DEFAULT_IGNORE_GLOBS = [
  '**/coverage/**',
  '**/dist/**',
  '**/generated/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/.turbo/**',
];

export type RetiredCoreNameViolation =
  | { kind: 'retired-directory'; path: string }
  | { kind: 'retired-package-name'; file: string; name: string }
  | { kind: 'retired-specifier'; file: string; line: number; specifier: string }
  | { kind: 'new-core-directory'; path: string };

export type RetiredCoreNameOptions = {
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

function listFiles(
  rootDir: string,
  patterns: string | string[],
  ignore: string[],
): string[] {
  return globSync(patterns, { cwd: rootDir, dot: false, ignore, nodir: true })
    .map(normalizePath)
    .sort((left, right) => left.localeCompare(right));
}

function collectRetiredDirectories(
  rootDir: string,
  ignore: string[],
): RetiredCoreNameViolation[] {
  return RETIRED_DIRECTORIES.filter(
    (directory) => listFiles(rootDir, `${directory}/**/*`, ignore).length > 0,
  ).map((directory) => ({ kind: 'retired-directory', path: directory }));
}

function collectNewCoreDirectories(
  rootDir: string,
  ignore: string[],
): RetiredCoreNameViolation[] {
  const coreDirectories = new Set<string>();
  const files = listFiles(
    rootDir,
    CORE_DIRECTORY_ROOTS.map((root) => `${root}/**/core/**/*`),
    ignore,
  );

  for (const file of files) {
    const segments = file.split('/');
    segments.forEach((segment, index) => {
      if (segment === 'core' && index < segments.length - 1) {
        coreDirectories.add(segments.slice(0, index + 1).join('/'));
      }
    });
  }

  return [...coreDirectories]
    .filter((directory) => !EXISTING_CORE_DIRECTORIES.has(directory))
    .sort((left, right) => left.localeCompare(right))
    .map((directory) => ({ kind: 'new-core-directory', path: directory }));
}

function collectFileViolations(
  file: string,
  source: string,
): RetiredCoreNameViolation[] {
  const violations: RetiredCoreNameViolation[] = [];

  if (file.endsWith('package.json')) {
    const manifest = JSON.parse(source) as { name?: unknown };
    if (
      typeof manifest.name === 'string' &&
      (RETIRED_PACKAGE_NAMES as readonly string[]).includes(manifest.name)
    ) {
      violations.push({
        file,
        kind: 'retired-package-name',
        name: manifest.name,
      });
    }
  }

  for (const match of source.matchAll(RETIRED_SPECIFIER_PATTERN)) {
    // A manifest's own `"name"` is reported once, as retired-package-name.
    if (MANIFEST_NAME_KEY_PATTERN.test(source.slice(0, match.index))) {
      continue;
    }
    violations.push({
      file,
      kind: 'retired-specifier',
      line: lineForOffset(source, match.index),
      specifier: match[2],
    });
  }

  return violations;
}

export function checkRetiredCoreNames(
  options: RetiredCoreNameOptions = {},
): RetiredCoreNameViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const ignore = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;
  const violations = [
    ...collectRetiredDirectories(rootDir, ignore),
    ...collectNewCoreDirectories(rootDir, ignore),
  ];

  for (const file of listFiles(
    rootDir,
    options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS,
    ignore,
  )) {
    const source = readFileSync(path.join(rootDir, file), 'utf8');
    violations.push(...collectFileViolations(file, source));
  }

  return violations;
}

function describe(violation: RetiredCoreNameViolation): string {
  switch (violation.kind) {
    case 'retired-directory':
      return `${violation.path}: retired package directory; shared server code lives in apps/server/api and workflow code in packages/workflows.`;
    case 'retired-package-name':
      return `${violation.file}: package name ${violation.name} is retired.`;
    case 'retired-specifier':
      return `${violation.file}:${violation.line}: ${violation.specifier} is retired; use @api/* or @genfeedai/workflows/<subpath>.`;
    case 'new-core-directory':
      return `${violation.path}: "core" is a retired name; name the directory after what it holds.`;
  }
}

if (import.meta.main) {
  const violations = checkRetiredCoreNames();

  if (violations.length > 0) {
    console.error('Retired "core" / "server" name violations (#4348):');
    for (const violation of violations) {
      console.error(`- ${describe(violation)}`);
    }
    process.exit(1);
  }

  console.log('Retired core/server name guard passed.');
}
