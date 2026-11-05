/**
 * nested-topbar.ts — blocks a second sub bar stacked inside a page body.
 *
 * A page has one sub bar. `Container` and `AdminPageShell` already render it
 * (through `SectionTopbar`) from their slots: `leading`, `refresh`,
 * `overflow`, `right` / `search`, `filters`, `primaryAction`. A
 * `<SectionTopbar>` written inside either one's children paints a second
 * full-bleed bar under the first, so its controls belong in those slots.
 *
 * A page that owns its only bar may still render `SectionTopbar` as a sibling
 * above a chrome-less `Container` (`moduleChrome={false}`); that is one bar,
 * not two, and stays allowed.
 *
 * Escape hatch: `ui-guard-allow:nested-topbar -- <reason>` on the offending
 * line or the line above. The reason is required.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';

export type NestedTopbarViolation = {
  file: string;
  line: number;
  message: string;
};

const ALLOW_PATTERN = /ui-guard-allow:nested-topbar\s+--\s+\S/;
const SECTION_TOPBAR_PATTERN = /<SectionTopbar\b/;
const BAR_HOSTS = new Set(['AdminPageShell', 'Container']);
const FILE_IGNORE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
];
const FILE_GLOBS = ['apps/**/*.tsx', 'packages/**/*.tsx'];

export function detectNestedTopbarViolations(
  filePath: string,
  source: string,
): NestedTopbarViolation[] {
  if (!SECTION_TOPBAR_PATTERN.test(source)) return [];

  const sourceFile = parseSourceFile(
    filePath,
    source,
    true,
    scriptKindFor(filePath),
  );
  const lines = source.split('\n');
  const violations: NestedTopbarViolation[] = [];

  const visit = (node: ts.Node, host: string | null): void => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText();
      // Attributes (a slot such as `leading={...}`) are not the body.
      const childHost = BAR_HOSTS.has(tag) ? tag : host;
      visit(node.openingElement, host);
      for (const child of node.children) visit(child, childHost);
      return;
    }

    if (
      host &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === 'SectionTopbar'
    ) {
      const line =
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1;
      const nearby = `${lines[line - 2] ?? ''}\n${lines[line - 1] ?? ''}`;
      if (!ALLOW_PATTERN.test(nearby)) {
        violations.push({
          file: filePath,
          line,
          message: `<SectionTopbar> inside <${host}> stacks a second bar. Pass its controls to the ${host} sub bar slots.`,
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, host));
  };
  visit(sourceFile, null);

  return violations;
}

export function runNestedTopbarGuard(options: {
  files?: readonly string[];
  rootDir?: string;
}): NestedTopbarViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files =
    options.files ??
    globSync(FILE_GLOBS, { cwd: rootDir, ignore: FILE_IGNORE, nodir: true });

  return files.flatMap((file) =>
    detectNestedTopbarViolations(
      file,
      readFileSync(path.join(rootDir, file), 'utf8'),
    ),
  );
}

if (import.meta.main) {
  // lint-staged passes absolute paths; report them relative to the repo.
  const files = process.argv
    .slice(2)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => path.relative(process.cwd(), path.resolve(file)));
  const violations = runNestedTopbarGuard(files.length > 0 ? { files } : {});
  if (violations.length > 0) {
    console.error('[nested-topbar-guard] Second sub bar inside a page body:');
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    console.error(
      '[nested-topbar-guard] One bar per page: use the Container or AdminPageShell slots. ' +
        'Escape hatch: `ui-guard-allow:nested-topbar -- reason`.',
    );
    process.exit(1);
  }
  console.log('[nested-topbar-guard] No stacked sub bars.');
}
