/**
 * table-dates.ts — blocks hand-formatted dates in table columns.
 *
 * A date in a table column renders through `TableDateCell`
 * (`@ui/display/table/TableDateCell`): one line, compact, the full date in its
 * tooltip, in the viewer's zone. A column (an object literal with `key`,
 * `header` and `render`) fails when its `render` formats a date itself:
 *   - `formatDate(...)`, `formatDateInTimezone(...)`
 *   - `.toLocaleDateString(...)`, `.toLocaleTimeString(...)`
 *   - `new Date(...).toLocaleString(...)`
 *   - date-fns `format(...)` in a file that imports it from `date-fns`
 *   - `<ClientFormattedDate>` without `format="relative"`
 *
 * Relative times ("3 hours ago") are not dates in this sense and stay allowed.
 *
 * Escape hatch: `ui-guard-allow:table-date -- <reason>` on the offending line
 * or the line above. The reason is required.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';

export type TableDateViolation = {
  file: string;
  line: number;
  message: string;
};

const ALLOW_PATTERN = /ui-guard-allow:table-date\s+--\s+\S/;
const FILE_IGNORE = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  'packages/ui/src/components/display/table/TableDateCell.tsx',
];
const FILE_GLOBS = ['apps/**/*.tsx', 'packages/**/*.tsx'];
const DATE_HELPERS = new Set(['formatDate', 'formatDateInTimezone']);
const DATE_METHODS = new Set(['toLocaleDateString', 'toLocaleTimeString']);

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!property.name) return null;
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function isTableColumn(node: ts.ObjectLiteralExpression): boolean {
  const names = new Set(node.properties.map(propertyName));
  return names.has('key') && names.has('header') && names.has('render');
}

function importsDateFnsFormat(sourceFile: ts.SourceFile): boolean {
  return sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'date-fns' &&
      statement.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some(
        (element) => element.name.text === 'format',
      ),
  );
}

function hasRelativeFormat(element: ts.JsxOpeningLikeElement): boolean {
  return element.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === 'format' &&
      attribute.initializer !== undefined &&
      ts.isStringLiteral(attribute.initializer) &&
      attribute.initializer.text === 'relative',
  );
}

function describeDateFormatting(
  node: ts.Node,
  hasDateFnsFormat: boolean,
): string | null {
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      if (DATE_HELPERS.has(callee.text)) return `${callee.text}()`;
      if (hasDateFnsFormat && callee.text === 'format') return 'format()';
    }
    if (ts.isPropertyAccessExpression(callee)) {
      const method = callee.name.text;
      if (DATE_METHODS.has(method)) return `.${method}()`;
      if (
        method === 'toLocaleString' &&
        ts.isNewExpression(callee.expression)
      ) {
        const dateConstructor = callee.expression.expression;
        if (
          ts.isIdentifier(dateConstructor) &&
          dateConstructor.text === 'Date'
        ) {
          return 'new Date().toLocaleString()';
        }
      }
    }
  }
  if (
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    node.tagName.getText() === 'ClientFormattedDate' &&
    !hasRelativeFormat(node)
  ) {
    return '<ClientFormattedDate>';
  }
  return null;
}

export function detectTableDateViolations(
  filePath: string,
  source: string,
): TableDateViolation[] {
  if (!/\brender\b/.test(source) || !/\bheader\b/.test(source)) return [];

  const sourceFile = parseSourceFile(
    filePath,
    source,
    true,
    scriptKindFor(filePath),
  );
  const lines = source.split('\n');
  const hasDateFnsFormat = importsDateFnsFormat(sourceFile);
  const violations: TableDateViolation[] = [];

  const scanRender = (render: ts.Node): void => {
    const visit = (node: ts.Node): void => {
      const found = describeDateFormatting(node, hasDateFnsFormat);
      if (found) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1;
        const isAllowed =
          ALLOW_PATTERN.test(lines[line - 1] ?? '') ||
          ALLOW_PATTERN.test(lines[line - 2] ?? '');
        if (!isAllowed) {
          violations.push({
            file: filePath,
            line,
            message: `Table column formats a date with ${found}. Render <TableDateCell value={...} />.`,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(render);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node) && isTableColumn(node)) {
      for (const property of node.properties) {
        if (propertyName(property) === 'render') scanRender(property);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return violations;
}

export function runTableDatesGuard(options: {
  files?: readonly string[];
  rootDir?: string;
}): TableDateViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files =
    options.files ??
    globSync(FILE_GLOBS, { cwd: rootDir, ignore: FILE_IGNORE, nodir: true });

  return files
    .filter((file) => file.endsWith('.tsx') && !/\.(test|spec)\./.test(file))
    .flatMap((file) =>
      detectTableDateViolations(
        file,
        readFileSync(path.join(rootDir, file), 'utf8'),
      ),
    );
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  const violations = runTableDatesGuard(files.length > 0 ? { files } : {});
  if (violations.length > 0) {
    console.error('[table-dates] Hand-formatted dates in table columns:');
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line} ${violation.message}`,
      );
    }
    console.error(
      '[table-dates] Escape hatch: `ui-guard-allow:table-date -- reason`.',
    );
    process.exit(1);
  }
  console.log('[table-dates] Every table date renders through TableDateCell.');
}
