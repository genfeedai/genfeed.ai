import ts from 'typescript';
import type { HandBuiltArea, HandBuiltFinding } from '../core';
import { classUtilities, finding, SHARED_PACKAGE, walkJsx } from '../jsx';
import { scanRestyle } from '../restyle';

/**
 * One empty state: `EmptyState` (bare, inside a surface that owns the frame)
 * and `EmptyStateCard` (framed), both from `@ui/primitives/empty-state`.
 * Callers pick a `size` and never restyle them, redefine them locally, or
 * hand-write a centred muted "nothing here" block.
 */
const IMPORT_PATHS = [
  '@ui/primitives/empty-state',
  '@genfeedai/ui/primitives/empty-state',
] as const;

const SHARED_NAMES = new Set([
  'CardEmpty',
  'CardEmptyContent',
  'EmptyState',
  'EmptyStateCard',
]);

const CENTERED_PADDING = /^py-(6|8|10|12|14|16)$/;
const DIM_TEXT = /^text-(muted-foreground|foreground\/\d+)$/;

const area: HandBuiltArea = {
  id: 'empty-state',
  scan: (source) => {
    // apps/mobile is React Native: the web components do not apply.
    if (
      SHARED_PACKAGE.test(source.file) ||
      source.file.startsWith('apps/mobile/')
    ) {
      return [];
    }
    const findings: HandBuiltFinding[] = [
      ...scanRestyle(source, {
        component: 'EmptyState',
        importPaths: IMPORT_PATHS,
        isSizeOwned: false,
        rule: 'empty-state-restyle',
      }),
      ...scanRestyle(source, {
        component: 'EmptyStateCard',
        importPaths: IMPORT_PATHS,
        isSizeOwned: false,
        rule: 'empty-state-restyle',
      }),
    ];

    walkJsx(source, (tag, _children, constants) => {
      const utilities = classUtilities(source, tag, constants);
      const hasCenteredPadding = [...utilities].some((token) =>
        CENTERED_PADDING.test(token),
      );
      const hasDimText = [...utilities].some((token) => DIM_TEXT.test(token));
      if (utilities.has('text-center') && hasCenteredPadding && hasDimText) {
        findings.push(
          ...finding(
            source,
            tag,
            'empty-state-hand-built',
            'Centred muted block with vertical padding is an empty state. Use EmptyState (or EmptyStateCard) from @ui/primitives/empty-state.',
          ),
        );
      }
    });

    for (const statement of source.sourceFile.statements) {
      const name = declaredName(statement);
      if (name && SHARED_NAMES.has(name)) {
        findings.push({
          detail: `Local ${name} duplicates the shared empty state. Import EmptyState or EmptyStateCard from @ui/primitives/empty-state.`,
          file: source.file,
          line:
            source.sourceFile.getLineAndCharacterOfPosition(
              statement.getStart(source.sourceFile),
            ).line + 1,
          rule: 'empty-state-duplicate',
        });
      }
    }

    return findings;
  },
};

function declaredName(statement: ts.Statement): string | undefined {
  if (ts.isFunctionDeclaration(statement)) {
    return statement.name?.text;
  }
  if (ts.isVariableStatement(statement)) {
    const declaration = statement.declarationList.declarations[0];
    return declaration && ts.isIdentifier(declaration.name)
      ? declaration.name.text
      : undefined;
  }
  return undefined;
}

export default area;
