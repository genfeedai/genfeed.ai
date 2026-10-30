import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from './architecture/parse-source-file';

/**
 * Every subbar has one slot contract. `Container`, `SectionTopbar`,
 * `AdminPageShell` and `ListPageLayout` each take refresh in `refresh`, and
 * their controls in the order `SubbarControls` owns: dropdowns, Filters,
 * views, primary action. So a page that hands one of them a refresh button or
 * a Filters menu in a free-form controls prop (`right`, `actions`, ...) has
 * drifted from the shared design.
 */

const INCLUDE_GLOBS = ['apps/app/app/**/*.tsx', 'packages/pages/**/*.tsx'];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/dist/**',
  '**/node_modules/**',
  '**/.next/**',
];

const BAR_COMPONENTS = new Set([
  'AdminPageShell',
  'Container',
  'ListPageLayout',
  'SectionTopbar',
]);

/** Free-form control props: anything placed here lands in the controls cluster. */
const CONTROL_PROPS = new Set([
  'actions',
  'dropdowns',
  'iconActions',
  'primaryAction',
  'right',
  'views',
]);

const FILTER_COMPONENTS = new Set(['FilterMenu', 'FiltersButton']);

export interface SubbarSlotViolation {
  file: string;
  line: number;
  message: string;
}

function tagNameOf(node: ts.Node): string | undefined {
  return ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)
    ? node.tagName.getText()
    : undefined;
}

function collectTags(node: ts.Node, tags: string[]): void {
  const tagName = tagNameOf(node);
  if (tagName === 'SubbarControls') {
    // The cluster owns the order; what a page passes into its slots is fine.
    return;
  }
  if (tagName) {
    tags.push(tagName);
  }
  ts.forEachChild(node, (child) => collectTags(child, tags));
}

export function findSubbarSlotViolations(
  file: string,
  source: string,
): SubbarSlotViolation[] {
  const sourceFile = parseSourceFile(file, source, true, scriptKindFor(file));
  const violations: SubbarSlotViolation[] = [];

  const visit = (node: ts.Node): void => {
    const barName = tagNameOf(node);
    if (
      barName &&
      BAR_COMPONENTS.has(barName) &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          !ts.isJsxAttribute(attribute) ||
          !attribute.initializer ||
          !CONTROL_PROPS.has(attribute.name.getText())
        ) {
          continue;
        }

        const tags: string[] = [];
        collectTags(attribute.initializer, tags);
        const line =
          sourceFile.getLineAndCharacterOfPosition(attribute.getStart()).line +
          1;

        if (tags.includes('ButtonRefresh')) {
          violations.push({
            file,
            line,
            message: `<${barName} ${attribute.name.getText()}> holds a ButtonRefresh. Pass it in the \`refresh\` slot.`,
          });
        }
        if (tags.some((tag) => FILTER_COMPONENTS.has(tag))) {
          violations.push({
            file,
            line,
            message: `<${barName} ${attribute.name.getText()}> holds a Filters menu outside SubbarControls. Attach it inside the page's SearchField, or pass it as \`filters\` of SubbarControls.`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function main(): void {
  const root = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    cwd: root,
    ignore: EXCLUDE_GLOBS,
  }).sort();

  const violations = files.flatMap((file) =>
    findSubbarSlotViolations(
      file.split(path.sep).join('/'),
      readFileSync(path.join(root, file), 'utf8'),
    ),
  );

  if (violations.length === 0) {
    console.log('[CheckSubbarSlots] Subbars use the shared slot contract.');
    return;
  }

  for (const violation of violations) {
    console.error(
      `[CheckSubbarSlots] ${violation.file}:${violation.line} ${violation.message}`,
    );
  }
  process.exit(1);
}

if (import.meta.main) {
  main();
}
