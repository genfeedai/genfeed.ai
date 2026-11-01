import ts from 'typescript';
import {
  type HandBuiltFinding,
  type HandBuiltSource,
  importedLocalNames,
  isAllowed,
  lineOf,
} from './core';

/**
 * A shared component owns its look: callers pick a `variant` or `size` and do
 * not restyle it with `className`. Layout (width, flex, margin, position,
 * alignment, cursor) stays on the call site; padding, shape, colour,
 * typography, border, shadow and gap belong to the component.
 */

const OWNED_UTILITIES: readonly RegExp[] = [
  /^(p|px|py|pt|pb|pl|pr|ps|pe)-/,
  /^rounded(-|$)/,
  /^(bg|from|via|to)-/,
  /^text-(?!left$|right$|center$|justify$|start$|end$|wrap$|nowrap$|balance$|pretty$|ellipsis$|clip$)/,
  /^(font|tracking|leading|gap|space-[xy]|divide|ring|shadow|outline)(-|$)/,
  /^(uppercase|lowercase|capitalize|normal-case|italic|not-italic|underline|no-underline)$/,
  /^border($|-)/,
];

/** Owned by a component only when it has fixed intrinsic height or size. */
const SIZE_UTILITIES: readonly RegExp[] = [/^(h|min-h|max-h|size)-/];

/** Everything after the last variant prefix (`md:`, `hover:`, `[&>svg]:`). */
export function utilityOf(token: string): string {
  let depth = 0;
  let lastColon = -1;
  for (let index = 0; index < token.length; index++) {
    const character = token[index];
    if (character === '[') {
      depth++;
    } else if (character === ']') {
      depth--;
    } else if (character === ':' && depth === 0) {
      lastColon = index;
    }
  }
  return token.slice(lastColon + 1).replace(/^[!-]+/, '');
}

export function ownedClasses(
  classString: string,
  options: { isSizeOwned: boolean },
): string[] {
  const patterns = options.isSizeOwned
    ? [...OWNED_UTILITIES, ...SIZE_UTILITIES]
    : OWNED_UTILITIES;
  return classString
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .filter((token) => {
      const utility = utilityOf(token);
      return patterns.some((pattern) => pattern.test(utility));
    });
}

export function collectStrings(
  node: ts.Node,
  constants: Map<string, string[]>,
  out: string[],
): void {
  if (ts.isStringLiteralLike(node)) {
    out.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      out.push(span.literal.text);
      collectStrings(span.expression, constants, out);
    }
    return;
  }
  if (ts.isIdentifier(node)) {
    out.push(...(constants.get(node.text) ?? []));
    return;
  }
  ts.forEachChild(node, (child) => collectStrings(child, constants, out));
}

export function collectConstantClassStrings(
  sourceFile: ts.SourceFile,
): Map<string, string[]> {
  const constants = new Map<string, string[]>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }
      const strings: string[] = [];
      collectStrings(declaration.initializer, new Map(), strings);
      if (strings.length > 0) {
        constants.set(declaration.name.text, strings);
      }
    }
  }
  return constants;
}

/**
 * A className that comes from a looked-up tone (`statusConfig.color`,
 * `getBadgeClass(x)`, `badgeTone`) is a restyle the literal scan cannot read.
 * A bare `className` pass-through is not.
 */
const TONE_NAME = /(Class|ClassName|Classes|Color|Colour|Tone)$/;
const TONE_PROPERTY = new Set(['className', 'color', 'colour', 'tone']);

function isToneName(name: string): boolean {
  return name !== 'className' && name !== 'classes' && TONE_NAME.test(name);
}

function hasLookedUpTone(node: ts.Node): boolean {
  if (ts.isIdentifier(node)) {
    return isToneName(node.text);
  }
  if (ts.isPropertyAccessExpression(node)) {
    const object = node.expression.getText();
    const isPassThrough =
      node.name.text === 'className' &&
      (object === 'props' || object === 'rest' || object === 'restProps');
    return (
      !isPassThrough &&
      (TONE_PROPERTY.has(node.name.text) || isToneName(node.name.text))
    );
  }
  if (ts.isCallExpression(node)) {
    const callee = ts.isIdentifier(node.expression) ? node.expression.text : '';
    if (callee !== 'cn' && callee !== 'clsx' && isToneName(callee)) {
      return true;
    }
    return node.arguments.some(hasLookedUpTone);
  }
  let isFound = false;
  ts.forEachChild(node, (child) => {
    isFound = isFound || hasLookedUpTone(child);
  });
  return isFound;
}

export interface RestyleRuleOptions {
  /** Exported component name, e.g. `Badge`. */
  component: string;
  /** Module paths that export it, e.g. `@ui/primitives/badge`. */
  importPaths: readonly string[];
  /** Whether fixed height and size classes are owned by the component. */
  isSizeOwned: boolean;
  /** Also flag a className read from a looked-up tone (`status.color`). */
  isToneLookupFlagged?: boolean;
  /** Rule id, also the key in the baseline and in `ui-guard-allow:<rule>`. */
  rule: string;
}

/** Files that define the shared component itself are not callers. */
const SHARED_PACKAGE = /^packages\/ui\//;

export function scanRestyle(
  source: HandBuiltSource,
  options: RestyleRuleOptions,
): HandBuiltFinding[] {
  if (SHARED_PACKAGE.test(source.file)) {
    return [];
  }
  const localNames = importedLocalNames(
    source.sourceFile,
    options.importPaths,
    options.component,
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
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source.sourceFile) === 'className' &&
          attribute.initializer
        ) {
          collectStrings(attribute.initializer, constants, strings);
        }
      }
      const owned = ownedClasses(strings.join(' '), {
        isSizeOwned: options.isSizeOwned,
      });
      for (const attribute of node.attributes.properties) {
        if (
          options.isToneLookupFlagged &&
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source.sourceFile) === 'className' &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression &&
          hasLookedUpTone(attribute.initializer.expression)
        ) {
          owned.push('(looked-up tone)');
        }
      }
      if (owned.length > 0 && !isAllowed(source, node, options.rule)) {
        findings.push({
          detail: `<${options.component}> restyled with className: ${[...new Set(owned)].join(' ')}. Pick a variant or size, or add one to the shared component.`,
          file: source.file,
          line: lineOf(source.sourceFile, node),
          rule: options.rule,
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source.sourceFile);
  return findings;
}
