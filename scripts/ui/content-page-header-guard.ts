/**
 * Protected-shell page identity guard.
 *
 * The permanent topbar breadcrumb is the visible page identity for protected
 * routes. Product canvases may retain one screen-reader-only h1, record and
 * state headings below h1, and action/filter toolbars. They must not render a
 * second visible h1 or an embedded Breadcrumb.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const INCLUDE_GLOBS = [
  'apps/app/app/(protected)/**/*.tsx',
  'apps/app/src/features/**/*.tsx',
  'packages/pages/**/*.tsx',
] as const;

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/node_modules/**',
  '**/dist/**',
] as const;

const VISIBLE_H1_EXCEPTIONS = new Set([
  // Authored article markup is the document being previewed, not app chrome.
  'apps/app/app/(protected)/[orgSlug]/[brandSlug]/compose/article/article-preview.tsx',
  // A 404 is a scoped error state, not protected-route page identity.
  'packages/pages/not-found/not-found-page.tsx',
]);

export type ContentPageHeaderViolation = {
  file: string;
  kind: 'embedded-breadcrumb' | 'visible-h1';
  line: number;
};

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function findVisibleH1Indexes(content: string): number[] {
  const indexes: number[] = [];
  const nativeH1Pattern = /<h1\b[\s\S]*?>/g;
  const headingH1Pattern = /<Heading\b(?=[^>]*\bas=["']h1["'])[^>]*>/g;

  for (const pattern of [nativeH1Pattern, headingH1Pattern]) {
    for (const match of content.matchAll(pattern)) {
      if (!match[0].includes('sr-only')) {
        indexes.push(match.index ?? 0);
      }
    }
  }

  return indexes;
}

export function findContentPageHeaderViolations(
  rootDir = process.cwd(),
): ContentPageHeaderViolation[] {
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });
  const violations: ContentPageHeaderViolation[] = [];

  for (const filePath of files) {
    const file = path.relative(rootDir, filePath).replaceAll('\\', '/');
    const content = readFileSync(filePath, 'utf8');

    if (!VISIBLE_H1_EXCEPTIONS.has(file)) {
      for (const index of findVisibleH1Indexes(content)) {
        violations.push({
          file,
          kind: 'visible-h1',
          line: lineOf(content, index),
        });
      }
    }

    for (const match of content.matchAll(/<Breadcrumb\b/g)) {
      violations.push({
        file,
        kind: 'embedded-breadcrumb',
        line: lineOf(content, match.index ?? 0),
      });
    }
  }

  return violations.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.kind.localeCompare(right.kind),
  );
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const violations = findContentPageHeaderViolations();

  if (violations.length > 0) {
    console.error(
      '[content-page-header-guard] Protected canvases must defer visible page identity to the shell breadcrumb.',
    );
    for (const violation of violations) {
      console.error(
        `[content-page-header-guard] ${violation.file}:${violation.line} ${violation.kind}`,
      );
    }
    process.exit(1);
  }

  console.log(
    '[content-page-header-guard] No visible protected page h1 or embedded breadcrumb found.',
  );
}
