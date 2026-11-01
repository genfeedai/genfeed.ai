import ts from 'typescript';
import {
  type HandBuiltArea,
  type HandBuiltFinding,
  type HandBuiltSource,
  isAllowed,
  lineOf,
} from '../core';
import { collectConstantClassStrings, collectStrings } from '../restyle';

/**
 * A notice (an error, a warning, a confirmation or a quiet aside inside a
 * page) is `@ui/primitives/alert`: pick a `variant` and `size`, and put the
 * copy in `AlertTitle`, `AlertDescription` and `AlertActions`. A `div` or `p`
 * that paints its own tinted box is a second Alert, so it fails here.
 *
 * Tone boxes carry a soft tone wash (`bg-destructive/10`, `bg-warning/5`, ...)
 * with a radius and padding. Note strips carry a neutral wash (`bg-muted/50`)
 * with small muted copy. Anything that is clickable, a pill, or a row of a
 * list is out of scope. An element that is deliberately not a notice can say
 * so with `ui-guard-allow:<rule> -- reason`.
 */

const TONES =
  'destructive|warning|success|info|red|amber|orange|yellow|emerald|green|blue|sky';

const TONE_WASH = new RegExp(`^bg-(${TONES})(-\\d+)?/\\d+$`);
const NEUTRAL_WASH =
  /^bg-(muted|card|background|foreground|secondary)(\/\d+)?$/;
const RADIUS = /^rounded(-(sm|md|lg|xl|2xl|3xl|\[[^\]]+\]))?$/;
const PADDING = /^(p|px|py)-/;
const SMALL_TEXT = /^text-(xs|2xs)$/;
const QUIET_COPY = /^text-(muted-foreground|foreground\/\d+)$/;

const NOTICE_TAGS = new Set(['div', 'p', 'section', 'aside']);

function classTokens(
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
  constants: Map<string, string[]>,
): Set<string> {
  const strings: string[] = [];
  for (const attribute of element.attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText(sourceFile) === 'className' &&
      attribute.initializer
    ) {
      collectStrings(attribute.initializer, constants, strings);
    }
  }
  // Only the base state: a `hover:` or `md:` wash is not the resting look.
  return new Set(
    strings
      .join(' ')
      .split(/\s+/)
      .filter((token) => token.length > 0 && !token.includes(':')),
  );
}

function hasAttribute(
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  names: readonly string[],
  sourceFile: ts.SourceFile,
): boolean {
  return element.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      names.includes(attribute.name.getText(sourceFile)),
  );
}

function matches(tokens: Set<string>, pattern: RegExp): boolean {
  return [...tokens].some((token) => pattern.test(token));
}

function isBlockBox(tokens: Set<string>): boolean {
  return (
    matches(tokens, RADIUS) &&
    matches(tokens, PADDING) &&
    !tokens.has('inline-flex') &&
    !tokens.has('cursor-pointer')
  );
}

function isPaddedBlock(tokens: Set<string>): boolean {
  return (
    matches(tokens, PADDING) &&
    !tokens.has('inline-flex') &&
    !tokens.has('cursor-pointer') &&
    !tokens.has('rounded-full')
  );
}

function scanNotices(source: HandBuiltSource): HandBuiltFinding[] {
  if (/^packages\/ui\//.test(source.file)) {
    return [];
  }
  const findings: HandBuiltFinding[] = [];
  const constants = collectConstantClassStrings(source.sourceFile);

  function report(node: ts.Node, rule: string, detail: string): void {
    if (!isAllowed(source, node, rule)) {
      findings.push({
        detail,
        file: source.file,
        line: lineOf(source.sourceFile, node),
        rule,
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source.sourceFile);
      if (
        NOTICE_TAGS.has(tag) &&
        !hasAttribute(
          node,
          ['onClick', 'onKeyDown', 'onPointerDown'],
          source.sourceFile,
        )
      ) {
        const tokens = classTokens(node, source.sourceFile, constants);
        // A tone wash is a notice even as a full-width bar without a radius.
        if (isPaddedBlock(tokens) && matches(tokens, TONE_WASH)) {
          report(
            node,
            'notice-tone-box',
            `<${tag}> paints its own tinted notice box. Use <Alert variant="destructive|warning|success|info"> with AlertTitle, AlertDescription and AlertActions.`,
          );
        } else if (
          isBlockBox(tokens) &&
          matches(tokens, NEUTRAL_WASH) &&
          matches(tokens, SMALL_TEXT) &&
          matches(tokens, QUIET_COPY)
        ) {
          report(
            node,
            'notice-note',
            `<${tag}> paints its own note strip. Use <Alert variant="note" size="sm">.`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source.sourceFile);
  return findings;
}

const area: HandBuiltArea = {
  id: 'notices',
  scan: scanNotices,
};

export default area;
