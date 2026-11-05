import ts from 'typescript';
import {
  type HandBuiltFinding,
  type HandBuiltSource,
  isAllowed,
  lineOf,
} from './core';
import {
  collectConstantClassStrings,
  collectStrings,
  utilityOf,
} from './restyle';

const WHITESPACE_RUN_PATTERN = /\s+/;
const CHIP_LAYOUT_CLASS_PATTERN =
  /^(inline-(flex|block)|w-fit|absolute|rounded-full)$/;
const ROUNDED_CLASS_PATTERN = /^rounded(-(?!none$).+)?$/;
const PADDING_X_PREFIX_PATTERN = /^px-/;
const HEIGHT_CLASS_PREFIX_PATTERN = /^(py-|h-|min-h-|leading-)/;
const UI_PACKAGE_PATH_PATTERN = /^packages\/ui\//;

/**
 * A badge, pill, chip or count dot is `Badge` from `@ui/primitives/badge`. A
 * `span`, `div` or `kbd` that carries its own shape, padding, small type and
 * a fill or border is the same thing hand-built, so it is flagged.
 */

const CHIP_TAGS = new Set(['span', 'div', 'kbd']);

const SMALL_TEXT = /^text-(2xs|xs|\[\d+(\.\d+)?px\])$/;

/** `px-*` alone is padding; `py-*`, `h-*` or `leading-*` make it a chip. */
function isChip(tag: string, classString: string): boolean {
  const utilities = classString
    .split(WHITESPACE_RUN_PATTERN)
    .filter((token) => token.length > 0)
    .map(utilityOf);
  const has = (pattern: RegExp): boolean =>
    utilities.some((utility) => pattern.test(utility));
  // A block-level `div` is a box (an alert, a note, a row), not a chip.
  const isInline = tag !== 'div' || has(CHIP_LAYOUT_CLASS_PATTERN);
  return (
    isInline &&
    has(ROUNDED_CLASS_PATTERN) &&
    has(PADDING_X_PREFIX_PATTERN) &&
    has(HEIGHT_CLASS_PREFIX_PATTERN) &&
    utilities.some((utility) => SMALL_TEXT.test(utility))
  );
}

export function scanChips(
  source: HandBuiltSource,
  rule: string,
): HandBuiltFinding[] {
  if (UI_PACKAGE_PATH_PATTERN.test(source.file)) {
    return [];
  }
  const constants = collectConstantClassStrings(source.sourceFile);
  const findings: HandBuiltFinding[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      CHIP_TAGS.has(node.tagName.getText(source.sourceFile))
    ) {
      const strings: string[] = [];
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source.sourceFile) === 'className' &&
          attribute.initializer
        ) {
          collectStrings(attribute.initializer, constants, strings);
        }
      }
      if (
        isChip(node.tagName.getText(source.sourceFile), strings.join(' ')) &&
        !isAllowed(source, node, rule)
      ) {
        findings.push({
          detail: `<${node.tagName.getText(source.sourceFile)}> is a hand-built badge. Use <Badge> from @ui/primitives/badge with a variant, or add the variant there.`,
          file: source.file,
          line: lineOf(source.sourceFile, node),
          rule,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source.sourceFile);
  return findings;
}
