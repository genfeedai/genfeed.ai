/**
 * progress.ts — blocks hand-built progress bars and step circles.
 *
 * `Progress` (size, tone) and `Stepper` live in `packages/ui/src/primitives`.
 * Three things fail here:
 *   1. `restyle`  — a `<Progress>` call that sets height, colour, shape or
 *      overflow through `className`, or passes `indicatorClassName`. Layout
 *      classes (width, flex, margin, position) stay allowed on the call site.
 *   2. `bar`      — a fill element (`h-full` or a bar height + inline
 *      `width: N%` or `scaleX(...)`) that rebuilds the bar by hand.
 *   3. `stepper`  — a numbered/checked step circle (`rounded-full`, centred,
 *      fixed 5-7 size) in a file that imports the `Check` icon.
 *
 * Escape hatch: `ui-guard-allow:progress -- <reason>` on the offending line or
 * the line above. The reason is required. `design-system-allow-content-color`
 * does not silence this guard.
 *
 * Baseline: `progress.baseline.json` holds per-file counts of spots that
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

export type ProgressViolationRule = 'bar' | 'restyle' | 'stepper';

export type ProgressViolation = {
  file: string;
  line: number;
  message: string;
  rule: ProgressViolationRule;
};

type Baseline = Record<string, number>;

const ALLOW_PATTERN = /ui-guard-allow:progress\s+--\s+\S/;
const FILE_IGNORE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  'packages/ui/src/primitives/progress.tsx',
  'packages/ui/src/primitives/stepper.tsx',
];
const FILE_GLOBS = ['apps/**/*.tsx', 'packages/**/*.tsx'];

/** Classes that restyle the bar. Anything else (w-*, flex-*, m*-*) is layout. */
const RESTYLE_CLASS =
  /^(?:!?)(?:-?)(?:h-|size-|min-h-|max-h-|bg-|border|rounded|overflow-|shadow|ring|opacity-|transition|duration-|text-|animate-)/;
const STEP_CIRCLE_SIZE = /^(?:size|h|w)-(?:5|6|7)$/;
const FILL_HEIGHT = /^h-(?:full|0\.5|1|1\.5|2|2\.5|3)$/;
const STEP_CIRCLE_TEXT = /^text-(?:2xs|xs|sm)$/;
const STEP_CIRCLE_WEIGHT = /^font-(?:medium|semibold|bold)$/;

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

function classTokens(attribute: ts.JsxAttribute): string[] {
  if (!attribute.initializer) return [];
  return stringsIn(attribute.initializer).flatMap((text) =>
    text.split(/\s+/).filter(Boolean),
  );
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

function isInlineFill(attribute: ts.JsxAttribute | undefined): boolean {
  if (!attribute?.initializer) return false;
  const text = attribute.initializer.getText();
  return /\bwidth\s*:\s*`[^`]*\$\{[^`]*%/.test(text) || /scaleX\(/.test(text);
}

export function detectProgressViolations(
  filePath: string,
  source: string,
): ProgressViolation[] {
  if (!/Progress|rounded-full|style=/.test(source)) return [];

  const sourceFile = parseSourceFile(
    filePath,
    source,
    true,
    scriptKindFor(filePath),
  );
  const lines = source.split('\n');
  const violations: ProgressViolation[] = [];
  const importsCheckIcon =
    /import\s*\{[^}]*\bCheck\b[^}]*\}\s*from\s*['"]lucide-react['"]/.test(
      source,
    );

  const report = (
    node: ts.Node,
    rule: ProgressViolationRule,
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
      const className = findAttribute(node, 'className');
      const tokens = className ? classTokens(className) : [];

      if (node.tagName.getText() === 'Progress') {
        if (findAttribute(node, 'indicatorClassName')) {
          report(
            node,
            'restyle',
            '<Progress indicatorClassName> — pass `tone` instead.',
          );
        }
        const restyles = tokens.filter((token) =>
          RESTYLE_CLASS.test(token.replace(/^[a-z-]+:/, '')),
        );
        if (restyles.length > 0) {
          report(
            node,
            'restyle',
            `<Progress className="${restyles.join(' ')}"> — use \`size\` and \`tone\`; className is for layout only.`,
          );
        }
      } else if (
        tokens.some((token) => FILL_HEIGHT.test(token)) &&
        isInlineFill(findAttribute(node, 'style'))
      ) {
        report(
          node,
          'bar',
          'Hand-built progress fill (h-full + inline width/scaleX). Use <Progress value>.',
        );
      }

      if (
        importsCheckIcon &&
        tokens.includes('rounded-full') &&
        tokens.includes('items-center') &&
        tokens.includes('justify-center') &&
        tokens.some((token) => STEP_CIRCLE_SIZE.test(token)) &&
        tokens.some((token) => STEP_CIRCLE_TEXT.test(token)) &&
        tokens.some((token) => STEP_CIRCLE_WEIGHT.test(token))
      ) {
        report(
          node,
          'stepper',
          'Hand-built step circle next to a Check icon. Use <Stepper>.',
        );
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

export function runProgressGuard(options: {
  baselinePath?: string;
  files?: readonly string[];
  rootDir?: string;
}): { failures: string[]; violations: ProgressViolation[] } {
  const rootDir = options.rootDir ?? process.cwd();
  const baselinePath =
    options.baselinePath ??
    fileURLToPath(new URL('./progress.baseline.json', import.meta.url));
  const baseline = loadBaseline(baselinePath);
  const files =
    options.files ??
    globSync(FILE_GLOBS, { cwd: rootDir, ignore: FILE_IGNORE, nodir: true });

  const violations = files.flatMap((file) =>
    detectProgressViolations(
      file,
      readFileSync(path.join(rootDir, file), 'utf8'),
    ),
  );

  const failures: string[] = [];
  const byFile = new Map<string, ProgressViolation[]>();
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
          `${file}: baseline allows ${allowed} but fewer remain. Lower it in progress.baseline.json.`,
        );
      }
    }
  }
  return { failures, violations };
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  const { failures } = runProgressGuard(files.length > 0 ? { files } : {});
  if (failures.length > 0) {
    console.error('[progress-guard] Hand-built progress UI found:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(
      '[progress-guard] Use Progress (size, tone) or Stepper from @ui/primitives. ' +
        'Escape hatch: `ui-guard-allow:progress -- reason`.',
    );
    process.exit(1);
  }
  console.log('[progress-guard] No hand-built progress UI.');
}
