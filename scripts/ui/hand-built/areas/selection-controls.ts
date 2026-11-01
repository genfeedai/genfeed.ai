import ts from 'typescript';
import {
  type HandBuiltArea,
  type HandBuiltFinding,
  type HandBuiltSource,
  importedLocalNames,
  isAllowed,
  lineOf,
} from '../core';
import {
  collectConstantClassStrings,
  collectStrings,
  scanRestyle,
} from '../restyle';

/**
 * Choice controls have shared components: `SegmentedControl` (single or
 * multiple, segmented bar or chips), `OptionTileGroup` + `OptionTile`
 * (selectable bordered tiles), `Toggle` (one on/off chip) and `Tabs`.
 * A selection is never painted by hand:
 *
 * - `selection-button`: a `Button` whose `variant` flips on a selection check.
 * - `selection-tile`: an `UNSTYLED` `Button` painting `border-primary` +
 *   `bg-primary/*` for its selected state.
 * - `segmented-restyle`, `option-tile-restyle`, `tabs-restyle`: callers do not
 *   restyle the shared components with `className` (layout classes are fine).
 */

const BUTTON_PATHS = [
  '@ui/primitives/button',
  '@genfeedai/ui/primitives/button',
] as const;
const SEGMENTED_PATHS = [
  '@ui/primitives/segmented-control',
  '@genfeedai/ui/primitives/segmented-control',
] as const;
const OPTION_TILE_PATHS = [
  '@ui/primitives/option-tile',
  '@genfeedai/ui/primitives/option-tile',
] as const;
const TABS_PATHS = [
  '@ui/primitives/tabs',
  '@genfeedai/ui/primitives/tabs',
] as const;

const SHARED_PACKAGE = /^packages\/ui\//;
const NEUTRAL_VARIANTS = new Set(['DEFAULT', 'SECONDARY', 'GHOST', 'OUTLINE']);
const SELECTION_NAME =
  /(^|\.)(is)?(selected|active|current|checked|pressed|on)$|(Selected|Active|Pressed|Checked)$/i;

function variantMember(node: ts.Expression): string | null {
  return ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'ButtonVariant'
    ? node.name.text
    : null;
}

function isSelectionCheck(condition: ts.Expression, text: string): boolean {
  if (ts.isParenthesizedExpression(condition)) {
    return isSelectionCheck(condition.expression, text);
  }
  if (ts.isBinaryExpression(condition)) {
    const operator = condition.operatorToken.kind;
    return (
      operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
    );
  }
  if (ts.isCallExpression(condition)) {
    return /\.(includes|has)$/.test(
      condition.expression.getText().replace(/\?\./g, '.'),
    );
  }
  return SELECTION_NAME.test(condition.getText());
}

function findSelectionVariant(
  expression: ts.Expression,
  source: HandBuiltSource,
): boolean {
  if (ts.isParenthesizedExpression(expression)) {
    return findSelectionVariant(expression.expression, source);
  }
  if (!ts.isConditionalExpression(expression)) {
    return false;
  }
  const whenTrue = variantMember(expression.whenTrue);
  const whenFalse = variantMember(expression.whenFalse);
  return (
    whenTrue !== null &&
    whenFalse !== null &&
    NEUTRAL_VARIANTS.has(whenTrue) &&
    NEUTRAL_VARIANTS.has(whenFalse) &&
    whenTrue !== whenFalse &&
    isSelectionCheck(expression.condition, source.text)
  );
}

function scanButtons(source: HandBuiltSource): HandBuiltFinding[] {
  if (SHARED_PACKAGE.test(source.file)) {
    return [];
  }
  const localNames = importedLocalNames(
    source.sourceFile,
    BUTTON_PATHS,
    'Button',
  );
  if (localNames.size === 0) {
    return [];
  }
  const constants = collectConstantClassStrings(source.sourceFile);
  const findings: HandBuiltFinding[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      localNames.has(node.tagName.getText(source.sourceFile))
    ) {
      const classStrings: string[] = [];
      let isUnstyled = false;
      let variantExpression: ts.Expression | undefined;
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !attribute.initializer) {
          continue;
        }
        const name = attribute.name.getText(source.sourceFile);
        if (name === 'className') {
          collectStrings(attribute.initializer, constants, classStrings);
        }
        if (name === 'variant' && ts.isJsxExpression(attribute.initializer)) {
          variantExpression = attribute.initializer.expression;
          isUnstyled =
            variantExpression !== undefined &&
            variantMember(variantExpression) === 'UNSTYLED';
        }
      }

      if (
        variantExpression &&
        findSelectionVariant(variantExpression, source) &&
        !isAllowed(source, node, 'selection-button')
      ) {
        findings.push({
          detail:
            '<Button> flips its variant on a selection check. Use SegmentedControl, OptionTileGroup or Toggle.',
          file: source.file,
          line: lineOf(source.sourceFile, node),
          rule: 'selection-button',
        });
      }

      const classes = classStrings.join(' ');
      if (
        isUnstyled &&
        /(^|\s)border(\s|$)/.test(classes) &&
        /(^|\s)border-primary(\/\d+)?(\s|$)/.test(classes) &&
        /(^|\s)bg-primary\/\d+(\s|$)/.test(classes) &&
        !isAllowed(source, node, 'selection-tile')
      ) {
        findings.push({
          detail:
            'UNSTYLED <Button> paints a selected tile (border-primary + bg-primary/*). Use OptionTile or SegmentedControl appearance="chip".',
          file: source.file,
          line: lineOf(source.sourceFile, node),
          rule: 'selection-tile',
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source.sourceFile);
  return findings;
}

const area: HandBuiltArea = {
  id: 'selection-controls',
  scan: (source) => [
    ...scanButtons(source),
    ...scanRestyle(source, {
      component: 'SegmentedControl',
      importPaths: SEGMENTED_PATHS,
      isSizeOwned: false,
      rule: 'segmented-restyle',
    }),
    ...scanRestyle(source, {
      component: 'OptionTile',
      importPaths: OPTION_TILE_PATHS,
      isSizeOwned: false,
      rule: 'option-tile-restyle',
    }),
    ...scanRestyle(source, {
      component: 'OptionTileGroup',
      importPaths: OPTION_TILE_PATHS,
      isSizeOwned: false,
      rule: 'option-tile-restyle',
    }),
    ...scanRestyle(source, {
      component: 'TabsList',
      importPaths: TABS_PATHS,
      isSizeOwned: false,
      rule: 'tabs-restyle',
    }),
    ...scanRestyle(source, {
      component: 'TabsTrigger',
      importPaths: TABS_PATHS,
      isSizeOwned: false,
      rule: 'tabs-restyle',
    }),
  ],
};

export default area;
