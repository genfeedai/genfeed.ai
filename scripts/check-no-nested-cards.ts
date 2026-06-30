import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const logger = {
  error: (message: string) => console.error(`[CheckNoNestedCards] ${message}`),
  log: (message: string) => console.log(`[CheckNoNestedCards] ${message}`),
};

const INCLUDE_GLOBS = [
  'apps/app/**/*.{tsx,jsx}',
  'packages/pages/**/*.{tsx,jsx}',
  'packages/ui/src/**/*.{tsx,jsx}',
];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.md',
  '**/*.mdx',
  '**/dist/**',
  '**/node_modules/**',
];

const ICON_COMPONENT_PREFIXES = [
  'Ai',
  'Bi',
  'Bs',
  'Cg',
  'Ci',
  'Di',
  'Fa',
  'Fc',
  'Fi',
  'Gi',
  'Go',
  'Gr',
  'Hi',
  'Im',
  'Io',
  'Lu',
  'Md',
  'Pi',
  'Ri',
  'Rx',
  'Si',
  'Sl',
  'Tb',
  'Ti',
  'Vsc',
  'Wi',
];

const CARD_HELPER_COMPONENTS = new Set([
  'CardContent',
  'CardEmptyContent',
  'CardIcon',
]);

const CARD_SURFACE_COMPONENTS = new Set([
  'Card',
  'EmptyStateCard',
  'FolderCard',
  'KPICard',
  'LinkCard',
  'MetricCard',
  'OverviewPlaceholderCard',
  'PricingCard',
  'SetupCard',
  'StatCard',
  'StatsCards',
]);

const CARD_CHROME_EXEMPT_COMPONENTS = new Set([
  'Input',
  'Select',
  'SelectContent',
  'SelectItem',
  'SelectTrigger',
  'SelectValue',
  'Textarea',
]);

type Violation = {
  detail: string;
  file: string;
  kind: 'nested-card-component' | 'nested-card-chrome';
  line: number;
};

export function runCheckNoNestedCards(): { violations: Violation[] } {
  const rootDir = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    );
    const relativePath = path.relative(rootDir, filePath);

    collectViolations(sourceFile, relativePath, violations);
  }

  return { violations };
}

function collectViolations(
  sourceFile: ts.SourceFile,
  relativePath: string,
  violations: Violation[],
) {
  function visit(node: ts.Node, cardDepth: number) {
    if (ts.isJsxElement(node)) {
      const tagName = getTagName(node.openingElement.tagName);
      const isCardSurface = isCardSurfaceTag(tagName);

      checkNode({
        cardDepth,
        className: getClassName(node.openingElement.attributes),
        isCardSurface,
        node,
        relativePath,
        sourceFile,
        tagName,
        violations,
      });

      const nextCardDepth = cardDepth + (isCardSurface ? 1 : 0);
      for (const child of node.children) {
        visit(child, nextCardDepth);
      }
      return;
    }

    if (ts.isJsxSelfClosingElement(node)) {
      const tagName = getTagName(node.tagName);
      const isCardSurface = isCardSurfaceTag(tagName);

      checkNode({
        cardDepth,
        className: getClassName(node.attributes),
        isCardSurface,
        node,
        relativePath,
        sourceFile,
        tagName,
        violations,
      });
      return;
    }

    ts.forEachChild(node, (child) => visit(child, cardDepth));
  }

  visit(sourceFile, 0);
}

function checkNode({
  cardDepth,
  className,
  isCardSurface,
  node,
  relativePath,
  sourceFile,
  tagName,
  violations,
}: {
  cardDepth: number;
  className: string;
  isCardSurface: boolean;
  node: ts.Node;
  relativePath: string;
  sourceFile: ts.SourceFile;
  tagName: string;
  violations: Violation[];
}) {
  if (cardDepth === 0) {
    return;
  }

  const line =
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
    1;

  if (isCardSurface) {
    violations.push({
      detail: tagName,
      file: relativePath,
      kind: 'nested-card-component',
      line,
    });
    return;
  }

  if (
    !CARD_CHROME_EXEMPT_COMPONENTS.has(tagName) &&
    hasNestedCardChrome(className)
  ) {
    violations.push({
      detail: className,
      file: relativePath,
      kind: 'nested-card-chrome',
      line,
    });
  }
}

function getTagName(tagName: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(tagName)) {
    return tagName.text;
  }

  if (ts.isPropertyAccessExpression(tagName)) {
    return tagName.name.text;
  }

  return tagName.getText();
}

function isCardSurfaceTag(tagName: string): boolean {
  if (CARD_HELPER_COMPONENTS.has(tagName)) {
    return false;
  }

  return (
    CARD_SURFACE_COMPONENTS.has(tagName) &&
    !ICON_COMPONENT_PREFIXES.some((prefix) => tagName.startsWith(prefix))
  );
}

function getClassName(attributes: ts.JsxAttributes): string {
  const fragments: string[] = [];

  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property)) {
      continue;
    }

    if (property.name.text !== 'className' || !property.initializer) {
      continue;
    }

    collectStringFragments(property.initializer, fragments);
  }

  return fragments.join(' ');
}

function collectStringFragments(node: ts.Node, fragments: string[]) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    fragments.push(node.text);
    return;
  }

  if (ts.isJsxExpression(node) && node.expression) {
    collectStringFragments(node.expression, fragments);
    return;
  }

  ts.forEachChild(node, (child) => collectStringFragments(child, fragments));
}

function hasNestedCardChrome(className: string): boolean {
  if (!className) {
    return false;
  }

  const classTokens = className.split(/\s+/).filter(Boolean);
  const hasRounded = classTokens.some(
    (classToken) =>
      classToken.includes('rounded') && !classToken.includes('rounded-full'),
  );
  const hasBorder = classTokens.some(
    (classToken) =>
      classToken === 'border' ||
      classToken.startsWith('border-') ||
      classToken.includes(':border') ||
      classToken.includes(':border-'),
  );
  const hasBackgroundOrShadow = classTokens.some(
    (classToken) =>
      classToken.startsWith('bg-') ||
      classToken.startsWith('shadow-') ||
      classToken.includes(':bg-') ||
      classToken.includes(':shadow-'),
  );
  const hasPanelPadding = classTokens.some((classToken) =>
    /(^|:)p-(3|4|5|6|7|8|9|10|11|12|\[)/.test(classToken),
  );

  return hasRounded && hasBorder && hasBackgroundOrShadow && hasPanelPadding;
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckNoNestedCards();

  if (violations.length > 0) {
    logger.error(
      'Nested card composition found. Use one card surface, then rows, separators, or unframed layout inside it.',
    );

    for (const violation of violations) {
      logger.error(
        `- [${violation.kind}] ${violation.file}:${violation.line} (${violation.detail})`,
      );
    }

    process.exit(1);
  }

  logger.log('No nested card composition found.');
}
