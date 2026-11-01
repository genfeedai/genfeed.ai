/**
 * view-tabs.ts — blocks tabs used as a view switcher or a filter.
 *
 * Views (day/week/month, grid/list/board) and filters (status, period, source)
 * are dropdowns in the sub bar: `ViewMenu` (`trigger="icon" | "label"`) and the
 * shared `FilterMenu`. Tabs are for sections of one thing (a detail page's
 * Overview / Content / Calendar), never for how a page shows or narrows its
 * results.
 *
 * Fails on a `<Tabs>` whose `ariaLabel` names a view, layout, filter, status
 * or period, which is how every view-switcher and filter tab bar labels
 * itself.
 *
 * Escape hatch: `ui-guard-allow:view-tabs -- <reason>` on the offending line or
 * the line above. The reason is required.
 *
 * Baseline: `view-tabs.baseline.json` holds per-file counts of spots that
 * predate the guard. New spots fail; a baseline larger than the real count
 * fails too, so the number can only go down.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';

export type ViewTabsViolation = {
  file: string;
  line: number;
  message: string;
};

type Baseline = Record<string, number>;

const ALLOW_PATTERN = /ui-guard-allow:view-tabs\s+--\s+\S/;
const FILE_IGNORE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  'packages/ui/src/components/navigation/tabs/**',
];
const FILE_GLOBS = ['apps/**/*.tsx', 'packages/**/*.tsx'];
const VIEW_OR_FILTER_WORDS = new Set([
  'filter',
  'filters',
  'layout',
  'layouts',
  'period',
  'status',
  'view',
  'views',
]);

/** Splits `labels.views`, `viewAria` or "Agent panel view" into lowercase words. */
function labelWords(label: string): string[] {
  return label
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function findAttribute(
  element: ts.JsxOpeningLikeElement,
  name: string,
): ts.JsxAttribute | undefined {
  for (const attribute of element.attributes.properties) {
    if (ts.isJsxAttribute(attribute) && attribute.name.getText() === name) {
      return attribute;
    }
  }
  return undefined;
}

export function detectViewTabsViolations(
  filePath: string,
  source: string,
): ViewTabsViolation[] {
  if (!/<Tabs\b/.test(source)) return [];

  const sourceFile = parseSourceFile(
    filePath,
    source,
    true,
    scriptKindFor(filePath),
  );
  const lines = source.split('\n');
  const violations: ViewTabsViolation[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === 'Tabs'
    ) {
      const label = findAttribute(node, 'ariaLabel')?.initializer?.getText();
      if (
        label &&
        labelWords(label).some((word) => VIEW_OR_FILTER_WORDS.has(word))
      ) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1;
        const nearby = `${lines[line - 2] ?? ''}\n${lines[line - 1] ?? ''}`;
        if (!ALLOW_PATTERN.test(nearby)) {
          violations.push({
            file: filePath,
            line,
            message: `<Tabs ariaLabel=${label}> switches a view or filter. Use ViewMenu or FilterMenu in the sub bar.`,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return violations;
}

function loadBaseline(baselinePath: string): Baseline {
  const parsed: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${baselinePath} must be an object of file -> count.`);
  }
  return parsed as Baseline;
}

export function runViewTabsGuard(options: {
  baselinePath?: string;
  files?: readonly string[];
  rootDir?: string;
}): { failures: string[]; violations: ViewTabsViolation[] } {
  const rootDir = options.rootDir ?? process.cwd();
  const baselinePath =
    options.baselinePath ??
    fileURLToPath(new URL('./view-tabs.baseline.json', import.meta.url));
  const baseline = loadBaseline(baselinePath);
  const files =
    options.files ??
    globSync(FILE_GLOBS, { cwd: rootDir, ignore: FILE_IGNORE, nodir: true });

  const violations = files.flatMap((file) =>
    detectViewTabsViolations(
      file,
      readFileSync(path.join(rootDir, file), 'utf8'),
    ),
  );

  const failures: string[] = [];
  const byFile = new Map<string, ViewTabsViolation[]>();
  for (const violation of violations) {
    byFile.set(violation.file, [
      ...(byFile.get(violation.file) ?? []),
      violation,
    ]);
  }
  for (const [file, found] of byFile) {
    const allowed = baseline[file] ?? 0;
    if (found.length > allowed) {
      for (const violation of found) {
        failures.push(
          `${violation.file}:${violation.line} ${violation.message}`,
        );
      }
    }
  }
  if (!options.files) {
    for (const [file, allowed] of Object.entries(baseline)) {
      if ((byFile.get(file)?.length ?? 0) < allowed) {
        failures.push(
          `${file}: baseline allows ${allowed} but fewer remain. Lower it in view-tabs.baseline.json.`,
        );
      }
    }
  }
  return { failures, violations };
}

if (import.meta.main) {
  // lint-staged passes absolute paths; the baseline is keyed by repo path.
  const files = process.argv
    .slice(2)
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => path.relative(process.cwd(), path.resolve(file)));
  const { failures } = runViewTabsGuard(files.length > 0 ? { files } : {});
  if (failures.length > 0) {
    console.error('[view-tabs-guard] Tabs used as a view switcher or filter:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      '[view-tabs-guard] Views and filters are dropdowns in the sub bar ' +
        '(ViewMenu, FilterMenu). Escape hatch: `ui-guard-allow:view-tabs -- reason`.',
    );
    process.exit(1);
  }
  console.log('[view-tabs-guard] No view or filter tabs.');
}
