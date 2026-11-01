/**
 * empty-states.ts — blocks hand-built empty states and EmptyState restyles.
 *
 * `EmptyState` lives in `packages/ui/src/primitives/empty-state.tsx` (surface,
 * size, isFill, action/actions). Two things fail here:
 *   1. `hand-built` — a centred block (`text-center` with py-6 or more, or a
 *      centred flex column) whose copy starts with "No …" or "Nothing …". Use
 *      `<EmptyState title description>`.
 *   2. `restyle`    — an `<EmptyState>` whose `className` sets padding, fill,
 *      edge, radius or type. Layout classes (width, height, margin, position,
 *      flex placement) stay allowed on the call site.
 *
 * Escape hatch: `ui-guard-allow:empty-state -- <reason>` on the offending line
 * or the line above. The reason is required.
 *
 * Baseline: `empty-states.baseline.json` holds per-file counts of spots that
 * predate the guard. New spots fail; a baseline larger than the real count
 * fails too, so the number can only go down. It is empty on purpose.
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

export type EmptyStateViolationRule = 'hand-built' | 'restyle';

export type EmptyStateViolation = {
  file: string;
  line: number;
  message: string;
  rule: EmptyStateViolationRule;
};

type Baseline = Record<string, number>;

const ALLOW_PATTERN = /ui-guard-allow:empty-state\s+--\s+\S/;
const FILE_IGNORE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  // React Native: no DOM primitives.
  'apps/mobile/**',
  'packages/ui/src/primitives/empty-state.tsx',
];
const FILE_GLOBS = ['apps/**/*.tsx', 'packages/**/*.tsx'];

const BLOCK_ELEMENTS = new Set(['div', 'p', 'section', 'li', 'span']);
/** Vertical padding of a block that is centring copy in the free space. */
const EMPTY_PADDING = /^(?:py|p)-(?:6|8|10|12|14|16|20|24)$/;
const EMPTY_COPY = /^\s*(?:No|Nothing)\b/;
/** What an EmptyState call site may not rewrite. Variant prefixes stripped. */
const RESTYLE_CLASS =
  /^!?(?:p[xytblrse]?-|bg-|border($|-)|rounded|shadow|ring|text-|font-|leading-|tracking-|gap-|space-[xy]-)/;

function stringsIn(node: ts.Node): string[] {
  const found: string[] = [];
  const visit = (child: ts.Node): void => {
    if (
      ts.isStringLiteral(child) ||
      ts.isNoSubstitutionTemplateLiteral(child) ||
      ts.isTemplateHead(child) ||
      ts.isTemplateMiddle(child) ||
      ts.isTemplateTail(child)
    ) {
      found.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function classTokens(element: ts.JsxOpeningLikeElement): string[] {
  for (const attribute of element.attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === 'className' &&
      attribute.initializer
    ) {
      return stringsIn(attribute.initializer).flatMap((text) =>
        text.split(/\s+/).filter(Boolean),
      );
    }
  }
  return [];
}

/** Copy written directly in the element or its nested text elements. */
function copyIn(node: ts.JsxElement): string[] {
  const found: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isJsxText(child) && child.text.trim()) {
      found.push(child.text.trim());
    } else if (
      ts.isJsxExpression(child) &&
      child.expression &&
      ts.isJsxElement(child.parent)
    ) {
      found.push(...stringsIn(child.expression));
    }
    if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
      ts.forEachChild(child, visit);
    } else if (ts.isJsxExpression(child)) {
      return;
    }
  };
  ts.forEachChild(node, visit);
  return found;
}

function isCentredBlock(tokens: string[]): boolean {
  const plain = tokens.filter((token) => !token.includes(':'));
  const isTextCentred =
    plain.includes('text-center') &&
    plain.some((token) => EMPTY_PADDING.test(token));
  const isFlexCentred =
    plain.includes('flex-col') &&
    plain.includes('items-center') &&
    plain.includes('justify-center') &&
    plain.includes('text-center');
  return isTextCentred || isFlexCentred;
}

export function detectEmptyStateViolations(
  filePath: string,
  source: string,
): EmptyStateViolation[] {
  if (!/text-center|EmptyState/.test(source)) return [];

  const sourceFile = parseSourceFile(
    filePath,
    source,
    true,
    scriptKindFor(filePath),
  );
  const lines = source.split('\n');
  const violations: EmptyStateViolation[] = [];

  const report = (
    node: ts.Node,
    rule: EmptyStateViolationRule,
    message: string,
  ): void => {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;
    const nearby = `${lines[line - 2] ?? ''}\n${lines[line - 1] ?? ''}`;
    if (ALLOW_PATTERN.test(nearby)) return;
    violations.push({ file: filePath, line, message, rule });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText() === 'EmptyState') {
        const restyles = classTokens(node).filter((token) =>
          RESTYLE_CLASS.test(token.split(':').pop() ?? token),
        );
        if (restyles.length > 0) {
          report(
            node,
            'restyle',
            `<EmptyState className="${restyles.join(' ')}"> — use \`size\`, \`surface\` or \`isFill\`; className is for layout only.`,
          );
        }
      }
    }
    if (
      ts.isJsxElement(node) &&
      BLOCK_ELEMENTS.has(node.openingElement.tagName.getText()) &&
      isCentredBlock(classTokens(node.openingElement)) &&
      copyIn(node).some((text) => EMPTY_COPY.test(text))
    ) {
      report(
        node.openingElement,
        'hand-built',
        'Hand-built empty state (centred "No …" copy). Use <EmptyState title description>.',
      );
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

export function runEmptyStatesGuard(options: {
  baselinePath?: string;
  files?: readonly string[];
  rootDir?: string;
}): { failures: string[]; violations: EmptyStateViolation[] } {
  const rootDir = options.rootDir ?? process.cwd();
  const baselinePath =
    options.baselinePath ??
    fileURLToPath(new URL('./empty-states.baseline.json', import.meta.url));
  const baseline = loadBaseline(baselinePath);
  const files = (
    options.files ??
    globSync(FILE_GLOBS, { cwd: rootDir, ignore: FILE_IGNORE, nodir: true })
  ).filter(
    (file) =>
      file.endsWith('.tsx') &&
      !/\.(test|spec)\./.test(file) &&
      !file.startsWith('apps/mobile/') &&
      file !== 'packages/ui/src/primitives/empty-state.tsx',
  );

  const violations = files.flatMap((file) =>
    detectEmptyStateViolations(
      file,
      readFileSync(path.join(rootDir, file), 'utf8'),
    ),
  );

  const failures: string[] = [];
  const byFile = new Map<string, EmptyStateViolation[]>();
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
          `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`,
        );
      }
    }
  }
  if (!options.files) {
    for (const [file, allowed] of Object.entries(baseline)) {
      if ((byFile.get(file)?.length ?? 0) < allowed) {
        failures.push(
          `${file}: baseline allows ${allowed} but fewer remain. Lower it in empty-states.baseline.json.`,
        );
      }
    }
  }
  return { failures, violations };
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  const { failures } = runEmptyStatesGuard(files.length > 0 ? { files } : {});
  if (failures.length > 0) {
    console.error('[empty-states-guard] Hand-built empty state found:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      '[empty-states-guard] Use EmptyState (surface, size, isFill) from @ui/primitives/empty-state. ' +
        'Escape hatch: `ui-guard-allow:empty-state -- reason`.',
    );
    process.exit(1);
  }
  console.log('[empty-states-guard] No hand-built empty states.');
}
