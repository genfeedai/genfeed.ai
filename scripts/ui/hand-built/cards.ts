/**
 * Cards and panels: blocks hand-built card surfaces, restyles of the shared
 * `Card`, and hand-built stat tiles.
 *
 * Three rules:
 *
 *  - `hand-built-card`: a raw `div`/`section`/`article`/`aside`/`li` whose
 *    classes combine a card surface (bg-card, bg-muted, bg-tertiary,
 *    bg-background …), a rounded corner and panel padding. Use
 *    `@ui/card/Card` (`variant`, `padding`, `gap`, `as`).
 *  - `card-restyle`: a `<Card>` whose `className` or `bodyClassName` rewrites
 *    padding, background, border, radius, shadow or typography. Layout classes
 *    (width, height, flex, margin, position, overflow) stay allowed. A look
 *    that is missing becomes a prop on Card, not a class at the call site.
 *  - `hand-built-stat`: a big bold dynamic number (text-2xl and up) sitting
 *    next to a small label (a `dt`, a text-xs/2xs/sm element or a small
 *    `Text`). Use `@ui/cards/metric-card/MetricCard`, which renders the value
 *    first and the label under it (`appearance="inset"` inside a card).
 *    Marketing and mobile apps own their own display type and are skipped.
 *
 * Escape hatch (one line above the element or on the attribute):
 *   // ui-guard-allow:hand-built-card -- <reason>
 *   // ui-guard-allow:card-restyle -- <reason>
 *   // ui-guard-allow:hand-built-stat -- <reason>
 *
 * Baseline: scripts/ui/hand-built/cards.baseline.json maps a file to the count
 * of known violations. It only ratchets down and is empty at the end of the
 * cards migration.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseSourceFile } from '../../architecture/parse-source-file';

export type CardsGuardRule =
  | 'hand-built-card'
  | 'card-restyle'
  | 'hand-built-stat';

export interface CardsGuardViolation {
  detail: string;
  file: string;
  line: number;
  rule: CardsGuardRule;
}

const logger = {
  error: (message: string) => console.error(`[cards-guard] ${message}`),
  log: (message: string) => console.log(`[cards-guard] ${message}`),
};

const INCLUDE_GLOBS = ['apps/**/*.tsx', 'packages/**/*.tsx'];
const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/generated/**',
  // The shared Card owns these looks.
  'packages/ui/src/components/card/Card.tsx',
];

const SURFACE_ELEMENTS = new Set(['div', 'section', 'article', 'aside', 'li']);

const SURFACE_TOKEN =
  /^(bg-(card|muted|tertiary|background|background-secondary)(\/\d+)?)$/;
const ROUNDED_TOKEN = /^rounded-(card|sm|md|lg|xl|2xl|3xl)$/;
const FLOATING_TOKEN = /^(absolute|fixed|sticky|shadow-dropdown|shadow-md)$/;

// What a Card call site may not rewrite: spacing, fill, edge, radius, shadow,
// type. Variant prefixes (hover:, sm:, group-hover: …) are stripped first.
const RESTYLE_TOKEN =
  /^!?(p[xytblrse]?-|bg-|border($|-)|rounded|shadow|ring|text-(?!left$|right$)|font-|leading-|tracking-|backdrop-|space-[xy]-|gap-|divide-|outline|transition|duration|ease-)/;

const ALLOW_MARKER = 'ui-guard-allow:';

// Hand-built stat tiles: a big bold value next to a small label.
const STAT_SKIPPED_PREFIXES = ['apps/marketing/', 'apps/mobile/'];
const HEADING_ELEMENTS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'Heading',
]);
const STAT_VALUE_SIZE = /^text-(2xl|3xl|4xl|5xl)$/;
const STAT_VALUE_WEIGHT = /^font-(semibold|bold)$/;
const STAT_LABEL_SIZE = /^text-(2xs|xs|sm)$/;
const STAT_LABEL_TONE =
  /^(text-muted-foreground|text-foreground\/\d+|uppercase)$/;
const SMALL_TEXT_SIZE = /^["'{\s]*(xs|sm)["'}\s]*$/;
const MUTED_TEXT_COLOR = /^["'{\s]*muted["'}\s]*$/;

function stripVariants(token: string): string {
  const parts = token.split(':');
  return parts[parts.length - 1] ?? token;
}

function collectFragments(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      collectFragments(span.expression, out);
      out.push(span.literal.text);
    }
    return;
  }
  ts.forEachChild(node, (child) => collectFragments(child, out));
}

function tokensOf(attribute: ts.JsxAttribute): string[] {
  if (!attribute.initializer) {
    return [];
  }
  const fragments: string[] = [];
  collectFragments(attribute.initializer, fragments);
  return fragments.join(' ').split(/\s+/).filter(Boolean);
}

function hasPanelPadding(tokens: string[]): boolean {
  const plain = tokens.filter((token) => !token.includes(':'));
  return (
    plain.some(
      (token) => /^p-[\d.]+$/.test(token) && Number(token.slice(2)) >= 2,
    ) ||
    (plain.some((token) => /^px-[\d.]+$/.test(token)) &&
      plain.some((token) => /^py-[\d.]+$/.test(token)))
  );
}

function isAllowed(
  sourceFile: ts.SourceFile,
  rule: CardsGuardRule,
  node: ts.Node,
): boolean {
  const lines = sourceFile.text.split('\n');
  const first = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
  const last = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  for (let line = Math.max(0, first - 2); line <= last; line += 1) {
    const text = lines[line] ?? '';
    if (text.includes(`${ALLOW_MARKER}${rule}`)) {
      return text.includes('--');
    }
  }
  return false;
}

function attributesOf(
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): ts.JsxAttribute[] {
  return element.attributes.properties.filter((property) =>
    ts.isJsxAttribute(property),
  ) as ts.JsxAttribute[];
}

function plainClassTokens(
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): string[] {
  const classAttribute = attributesOf(element).find(
    (attribute) => attribute.name.getText() === 'className',
  );
  return classAttribute
    ? tokensOf(classAttribute).filter((token) => !token.includes(':'))
    : [];
}

function openingOf(
  node: ts.Node,
): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
  if (ts.isJsxElement(node)) {
    return node.openingElement;
  }
  return ts.isJsxSelfClosingElement(node) ? node : null;
}

/** A small muted caption: a `dt`, a muted xs/sm `Text`, or muted small type. */
function isSmallLabel(node: ts.Node): boolean {
  const opening = openingOf(node);
  if (!opening) {
    return false;
  }
  const tagName = opening.tagName.getText();
  if (tagName === 'dt') {
    return true;
  }
  if (tagName === 'Text') {
    const attributeText = (name: string): string =>
      attributesOf(opening)
        .find((attribute) => attribute.name.getText() === name)
        ?.initializer?.getText() ?? '';
    return (
      SMALL_TEXT_SIZE.test(attributeText('size')) &&
      MUTED_TEXT_COLOR.test(attributeText('color'))
    );
  }
  const tokens = plainClassTokens(opening);
  return (
    tokens.some((token) => STAT_LABEL_SIZE.test(token)) &&
    tokens.some((token) => STAT_LABEL_TONE.test(token))
  );
}

function isHandBuiltStat(node: ts.JsxElement): boolean {
  const opening = node.openingElement;
  if (HEADING_ELEMENTS.has(opening.tagName.getText())) {
    return false;
  }
  const tokens = plainClassTokens(opening);
  if (
    !tokens.some((token) => STAT_VALUE_SIZE.test(token)) ||
    !tokens.some((token) => STAT_VALUE_WEIGHT.test(token)) ||
    !node.children.some((child) => ts.isJsxExpression(child))
  ) {
    return false;
  }
  // `{isLoading ? <Skeleton /> : <p>{value}</p>}` sits in the parent as a
  // JSX expression, so climb to it before looking at the siblings.
  let slot: ts.Node = node;
  while (
    ts.isParenthesizedExpression(slot.parent) ||
    ts.isConditionalExpression(slot.parent) ||
    ts.isBinaryExpression(slot.parent) ||
    ts.isJsxExpression(slot.parent)
  ) {
    slot = slot.parent;
  }
  const parent = slot.parent;
  if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) {
    return false;
  }
  const siblings = parent.children.filter(
    (child) => !ts.isJsxText(child) || child.text.trim().length > 0,
  );
  const index = siblings.indexOf(slot as ts.JsxChild);
  return [siblings[index - 1], siblings[index + 1]].some(
    (sibling) => sibling !== undefined && isSmallLabel(sibling),
  );
}

function scanContent(
  filePath: string,
  relativePath: string,
  content: string,
): CardsGuardViolation[] {
  if (!/classname/i.test(content)) {
    return [];
  }
  const sourceFile = parseSourceFile(
    filePath,
    content,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: CardsGuardViolation[] = [];

  const inspect = (
    element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  ): void => {
    const tagName = element.tagName.getText();
    const line =
      sourceFile.getLineAndCharacterOfPosition(element.getStart()).line + 1;
    const attributes = attributesOf(element);

    if (SURFACE_ELEMENTS.has(tagName)) {
      const classAttribute = attributes.find(
        (attribute) => attribute.name.getText() === 'className',
      );
      if (!classAttribute) {
        return;
      }
      const tokens = tokensOf(classAttribute);
      const plain = tokens.filter((token) => !token.includes(':'));
      const isFloating = plain.some((token) => FLOATING_TOKEN.test(token));
      // Selectable tiles and rows belong to the option-tile migration.
      const isControl = attributes.some((attribute) => {
        const name = attribute.name.getText();
        return name === 'onClick' || name === 'role';
      });
      const isPill = plain.some(
        (token) => token === 'rounded-full' || token === 'inline-flex',
      );
      if (
        !isFloating &&
        !isPill &&
        !isControl &&
        plain.some((token) => SURFACE_TOKEN.test(token)) &&
        plain.some((token) => ROUNDED_TOKEN.test(token)) &&
        hasPanelPadding(tokens) &&
        !isAllowed(sourceFile, 'hand-built-card', element)
      ) {
        violations.push({
          detail: `<${tagName}> ${tokens.join(' ')}`,
          file: relativePath,
          line,
          rule: 'hand-built-card',
        });
      }
      return;
    }

    if (tagName === 'Card') {
      for (const attribute of attributes) {
        const name = attribute.name.getText();
        if (name !== 'className' && name !== 'bodyClassName') {
          continue;
        }
        const bad = tokensOf(attribute)
          .map(stripVariants)
          .filter((token) => RESTYLE_TOKEN.test(token));
        if (bad.length > 0 && !isAllowed(sourceFile, 'card-restyle', element)) {
          violations.push({
            detail: `<Card ${name}> ${bad.join(' ')}`,
            file: relativePath,
            line:
              sourceFile.getLineAndCharacterOfPosition(attribute.getStart())
                .line + 1,
            rule: 'card-restyle',
          });
        }
      }
    }
  };

  const isStatScope = !STAT_SKIPPED_PREFIXES.some((prefix) =>
    relativePath.startsWith(prefix),
  );

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      inspect(node);
    }
    if (
      isStatScope &&
      ts.isJsxElement(node) &&
      isHandBuiltStat(node) &&
      !isAllowed(sourceFile, 'hand-built-stat', node.openingElement)
    ) {
      violations.push({
        detail: `<${node.openingElement.tagName.getText()}> ${plainClassTokens(node.openingElement).join(' ')}`,
        file: relativePath,
        line:
          sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        rule: 'hand-built-stat',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function runCardsGuard(rootDir = process.cwd()): CardsGuardViolation[] {
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    cwd: rootDir,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });
  const violations: CardsGuardViolation[] = [];
  for (const filePath of files) {
    violations.push(
      ...scanContent(
        filePath,
        path.relative(rootDir, filePath),
        readFileSync(filePath, 'utf8'),
      ),
    );
  }
  return violations.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  );
}

export function scanSource(
  source: string,
  fileName = 'sample.tsx',
): CardsGuardViolation[] {
  return scanContent(fileName, fileName, source);
}

function loadBaseline(rootDir: string): Record<string, number> {
  try {
    return JSON.parse(
      readFileSync(
        path.join(rootDir, 'scripts/ui/hand-built/cards.baseline.json'),
        'utf8',
      ),
    ) as Record<string, number>;
  } catch {
    return {};
  }
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return (
    Boolean(entryPoint) && path.resolve(entryPoint) === path.resolve(__filename)
  );
}

if (isMainModule()) {
  const rootDir = process.cwd();
  const violations = runCardsGuard(rootDir);
  const baseline = loadBaseline(rootDir);
  const perFile = new Map<string, CardsGuardViolation[]>();
  for (const violation of violations) {
    perFile.set(violation.file, [
      ...(perFile.get(violation.file) ?? []),
      violation,
    ]);
  }

  const failures: string[] = [];
  for (const [file, found] of perFile) {
    const allowed = baseline[file] ?? 0;
    if (found.length > allowed) {
      for (const violation of found) {
        failures.push(
          `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`,
        );
      }
    }
  }
  const stale: string[] = [];
  for (const [file, allowed] of Object.entries(baseline)) {
    const found = perFile.get(file)?.length ?? 0;
    if (found < allowed) {
      stale.push(`${file}: baseline ${allowed}, found ${found}`);
    }
  }

  if (failures.length > 0) {
    logger.error(
      'Hand-built card surface, Card restyle or stat tile found. Use Card props (variant, padding, gap, as, tone, isSelected, isInteractive) and put layout classes only on the call site. Stat tiles use MetricCard (value first, label under it; appearance="inset" inside a card). To keep a one-off, add `// ui-guard-allow:<rule> -- reason`.',
    );
    for (const failure of failures) {
      logger.error(`- ${failure}`);
    }
  }
  if (stale.length > 0) {
    logger.error(
      'cards.baseline.json is stale, lower these entries (the baseline only ratchets down):',
    );
    for (const entry of stale) {
      logger.error(`- ${entry}`);
    }
  }
  if (failures.length > 0 || stale.length > 0) {
    process.exit(1);
  }
  logger.log('No hand-built card surfaces, Card restyles or stat tiles found.');
}
