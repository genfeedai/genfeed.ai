/**
 * table-columns.ts — keeps table cells to content.
 *
 * Rule `date`: a date in a table column renders through `TableDateCell`
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
 * Rule `action`: a column's `render` never holds a control that acts on the
 * row (`<Button onClick>`, `<Button asChild>`, `<ButtonDropdown>`,
 * `<DropdownMenu>`). An unstyled button (a clickable name or thumbnail) is
 * content and stays allowed. Row actions go in the table's `actions` (or
 * `renderRowActions`): ghost icons over the row's end, revealed on hover or
 * focus, so they never sit in a column of their own.
 *
 * Escape hatch: `ui-guard-allow:table-date -- <reason>` or
 * `ui-guard-allow:table-action -- <reason>` on the offending line or the line
 * above. The reason is required.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from '../../architecture/parse-source-file';

export type TableColumnRule = 'action' | 'date';

export type TableColumnViolation = {
  file: string;
  line: number;
  message: string;
  rule: TableColumnRule;
};

const ALLOW_PATTERNS: Record<TableColumnRule, RegExp> = {
  action: /ui-guard-allow:table-action\s+--\s+\S/,
  date: /ui-guard-allow:table-date\s+--\s+\S/,
};
const ACTION_ATTRIBUTES = new Set(['asChild', 'href', 'onClick']);
const MENU_TAGS = new Set(['ButtonDropdown', 'DropdownMenu']);
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

function describeCellAction(node: ts.Node): string | null {
  if (!(ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))) {
    return null;
  }
  const tag = node.tagName.getText();
  if (MENU_TAGS.has(tag)) return `<${tag}>`;
  if (tag !== 'Button') return null;
  // An unstyled button is the cell's own content made clickable (a name or a
  // thumbnail that opens the record), not a control sitting in the cell.
  const isUnstyled = node.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === 'variant' &&
      attribute.initializer?.getText().includes('ButtonVariant.UNSTYLED') ===
        true,
  );
  if (isUnstyled) return null;
  const actionAttribute = node.attributes.properties.find(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      ACTION_ATTRIBUTES.has(attribute.name.getText()),
  );
  return actionAttribute && ts.isJsxAttribute(actionAttribute)
    ? `<Button ${actionAttribute.name.getText()}>`
    : null;
}

const RULE_MESSAGES: Record<TableColumnRule, (found: string) => string> = {
  action: (found) =>
    `Table column renders a row control (${found}). Put it in the table's \`actions\`.`,
  date: (found) =>
    `Table column formats a date with ${found}. Render <TableDateCell value={...} />.`,
};

export function detectTableColumnViolations(
  filePath: string,
  source: string,
): TableColumnViolation[] {
  if (!/\brender\b/.test(source) || !/\bheader\b/.test(source)) return [];

  const sourceFile = parseSourceFile(
    filePath,
    source,
    true,
    scriptKindFor(filePath),
  );
  const lines = source.split('\n');
  const hasDateFnsFormat = importsDateFnsFormat(sourceFile);
  const violations: TableColumnViolation[] = [];

  const report = (node: ts.Node, rule: TableColumnRule, found: string) => {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;
    const isAllowed =
      ALLOW_PATTERNS[rule].test(lines[line - 1] ?? '') ||
      ALLOW_PATTERNS[rule].test(lines[line - 2] ?? '');
    if (!isAllowed) {
      violations.push({
        file: filePath,
        line,
        message: RULE_MESSAGES[rule](found),
        rule,
      });
    }
  };

  const scanRender = (render: ts.Node): void => {
    const visit = (node: ts.Node): void => {
      const date = describeDateFormatting(node, hasDateFnsFormat);
      if (date) report(node, 'date', date);
      const action = describeCellAction(node);
      if (action) report(node, 'action', action);
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

export function runTableColumnsGuard(options: {
  files?: readonly string[];
  rootDir?: string;
}): TableColumnViolation[] {
  const rootDir = options.rootDir ?? process.cwd();
  const files =
    options.files ??
    globSync(FILE_GLOBS, { cwd: rootDir, ignore: FILE_IGNORE, nodir: true });

  return files
    .filter((file) => file.endsWith('.tsx') && !/\.(test|spec)\./.test(file))
    .flatMap((file) =>
      detectTableColumnViolations(
        file,
        readFileSync(path.join(rootDir, file), 'utf8'),
      ),
    );
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  const violations = runTableColumnsGuard(files.length > 0 ? { files } : {});
  if (violations.length > 0) {
    console.error(
      '[table-columns] Table cells that hold dates or row controls:',
    );
    for (const violation of violations) {
      console.error(
        `  ${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`,
      );
    }
    console.error(
      '[table-columns] Escape hatch: `ui-guard-allow:table-date|table-action -- reason`.',
    );
    process.exit(1);
  }
  console.log(
    '[table-columns] Table dates use TableDateCell and row controls are row actions.',
  );
}
