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
  ownedClasses,
} from '../restyle';

/**
 * Buttons and clickable things have shared components. A control is never
 * painted, labelled or wired by hand:
 *
 * - `button-restyle`: a shared-variant `<Button>` restyled with `className`
 *   (padding, shape, colour, typography, border, shadow, gap). Pick a
 *   `variant` or `size`, or add one to `Button`.
 * - `unstyled-look`: an `UNSTYLED` `<Button>` that paints its own look. A
 *   look is a variant; `UNSTYLED` is only for a control whose look is owned by
 *   a parent component (a menu row, a list cell).
 * - `native-title`: `title=` on a plain element. The browser tooltip has no
 *   keyboard or touch path and no styling; use `Button tooltip=` or `Tooltip`.
 * - `clickable-element`: `onClick` on a `div`, `span` or other non-interactive
 *   element with no `role` and no key handler, so it has no keyboard path.
 *
 * An element that is deliberately outside a rule says so with
 * `ui-guard-allow:<rule> -- reason` on the line above.
 */

const BUTTON_PATHS = [
  '@ui/primitives/button',
  '@genfeedai/ui/primitives/button',
] as const;

const SHARED_PACKAGE = /^packages\/ui\//;
const NON_INTERACTIVE_TAGS = new Set([
  'article',
  'aside',
  'div',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'img',
  'li',
  'main',
  'nav',
  'p',
  'section',
  'span',
  'td',
  'th',
  'tr',
  'ul',
]);
const KEY_HANDLERS = new Set(['onKeyDown', 'onKeyPress', 'onKeyUp']);
/** Looks a `UNSTYLED` button may not paint: colour, surface, shape, shadow. */
const UNSTYLED_LOOK = [
  /^bg-/,
  /^rounded(-|$)/,
  /^border($|-)/,
  /^shadow(-|$)/,
  /^ring(-|$)/,
  /^text-(?!left$|right$|center$|start$|end$|xs$|sm$|base$|lg$|xl$|2xs$|\dxl$|wrap$|nowrap$|balance$|ellipsis$|\[)/,
  /^(hover|focus|focus-visible|active|disabled):/,
] as const;

function attributeName(
  attribute: ts.JsxAttributeLike,
  sourceFile: ts.SourceFile,
): string | null {
  return ts.isJsxAttribute(attribute)
    ? attribute.name.getText(sourceFile)
    : null;
}

function isUnstyledVariant(initializer: ts.JsxAttribute['initializer']) {
  return (
    initializer !== undefined &&
    ts.isJsxExpression(initializer) &&
    initializer.expression !== undefined &&
    ts.isPropertyAccessExpression(initializer.expression) &&
    initializer.expression.expression.getText() === 'ButtonVariant' &&
    initializer.expression.name.text === 'UNSTYLED'
  );
}

function hasLookClass(classes: string): boolean {
  return classes
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .some((token) => {
      // Variant-prefixed tokens (`hover:`, `md:`) are classified on the whole
      // token for state prefixes and on the utility for responsive ones.
      const stateMatch = /^(hover|focus|focus-visible|active|disabled):/.test(
        token,
      );
      if (stateMatch) {
        return true;
      }
      const utility = token.replace(/^[a-z0-9-]+:/, '').replace(/^[!-]+/, '');
      return UNSTYLED_LOOK.some((pattern) => pattern.test(utility));
    });
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
      const strings: string[] = [];
      let isUnstyled = false;
      for (const attribute of node.attributes.properties) {
        const name = attributeName(attribute, source.sourceFile);
        if (name === 'className' && ts.isJsxAttribute(attribute)) {
          if (attribute.initializer) {
            collectStrings(attribute.initializer, constants, strings);
          }
        }
        if (name === 'variant' && ts.isJsxAttribute(attribute)) {
          isUnstyled = isUnstyledVariant(attribute.initializer);
        }
      }
      const classes = strings.join(' ');
      if (isUnstyled) {
        if (
          hasLookClass(classes) &&
          !isAllowed(source, node, 'unstyled-look')
        ) {
          findings.push({
            detail:
              'UNSTYLED <Button> paints its own look. Use a Button variant, or add one.',
            file: source.file,
            line: lineOf(source.sourceFile, node),
            rule: 'unstyled-look',
          });
        }
      } else {
        const owned = ownedClasses(classes, { isSizeOwned: false });
        if (owned.length > 0 && !isAllowed(source, node, 'button-restyle')) {
          findings.push({
            detail: `<Button> restyled with className: ${[...new Set(owned)].join(' ')}. Pick a variant or size, or add one to Button.`,
            file: source.file,
            line: lineOf(source.sourceFile, node),
            rule: 'button-restyle',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source.sourceFile);
  return findings;
}

function scanElements(source: HandBuiltSource): HandBuiltFinding[] {
  const findings: HandBuiltFinding[] = [];

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source.sourceFile);
      const isIntrinsic = /^[a-z]/.test(tag);
      if (isIntrinsic) {
        const names = new Set(
          node.attributes.properties
            .map((attribute) => attributeName(attribute, source.sourceFile))
            .filter((name): name is string => name !== null),
        );
        const hasSpread = node.attributes.properties.some((attribute) =>
          ts.isJsxSpreadAttribute(attribute),
        );

        if (
          names.has('title') &&
          tag !== 'iframe' &&
          tag !== 'svg' &&
          !isAllowed(source, node, 'native-title')
        ) {
          findings.push({
            detail: `<${tag} title=…> is a native browser tooltip. Use Button tooltip= or the Tooltip component.`,
            file: source.file,
            line: lineOf(source.sourceFile, node),
            rule: 'native-title',
          });
        }

        if (
          NON_INTERACTIVE_TAGS.has(tag) &&
          names.has('onClick') &&
          !names.has('role') &&
          !hasSpread &&
          ![...names].some((name) => KEY_HANDLERS.has(name)) &&
          !isAllowed(source, node, 'clickable-element')
        ) {
          findings.push({
            detail: `<${tag} onClick> has no role and no key handler, so keyboard users cannot reach it. Use a Button (variant UNSTYLED is not enough: use a real variant) or a link.`,
            file: source.file,
            line: lineOf(source.sourceFile, node),
            rule: 'clickable-element',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source.sourceFile);
  return findings;
}

const area: HandBuiltArea = {
  id: 'buttons',
  scan: (source) => [...scanButtons(source), ...scanElements(source)],
};

export default area;
