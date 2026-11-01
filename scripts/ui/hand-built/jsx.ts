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

export type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

/** Files that define the shared components are not callers. */
export const SHARED_PACKAGE = /^packages\/ui\//;

/** Utility tokens of one JSX tag, with responsive/state prefixes stripped. */
export function classUtilities(
  source: HandBuiltSource,
  tag: JsxTag,
  constants: Map<string, string[]>,
): Set<string> {
  const strings: string[] = [];
  for (const attribute of tag.attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      /^(className|\w+ClassName)$/.test(
        attribute.name.getText(source.sourceFile),
      ) &&
      attribute.initializer
    ) {
      collectStrings(attribute.initializer, constants, strings);
    }
  }
  return new Set(
    strings
      .join(' ')
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .map(utilityOf),
  );
}

export function tagNameOf(source: HandBuiltSource, tag: JsxTag): string {
  return tag.tagName.getText(source.sourceFile);
}

/** The opening element of each JSX element, with its child elements. */
export function walkJsx(
  source: HandBuiltSource,
  visit: (
    tag: JsxTag,
    children: JsxTag[],
    constants: Map<string, string[]>,
  ) => void,
): void {
  const constants = collectConstantClassStrings(source.sourceFile);

  function childTags(element: ts.JsxElement): JsxTag[] {
    return element.children.flatMap((child) => {
      if (ts.isJsxElement(child)) {
        return [child.openingElement];
      }
      if (ts.isJsxSelfClosingElement(child)) {
        return [child];
      }
      return [];
    });
  }

  function walk(node: ts.Node): void {
    if (ts.isJsxElement(node)) {
      visit(node.openingElement, childTags(node), constants);
    } else if (ts.isJsxSelfClosingElement(node)) {
      visit(node, [], constants);
    }
    ts.forEachChild(node, walk);
  }

  walk(source.sourceFile);
}

export function finding(
  source: HandBuiltSource,
  tag: JsxTag,
  rule: string,
  detail: string,
): HandBuiltFinding[] {
  if (isAllowed(source, tag, rule)) {
    return [];
  }
  return [
    { detail, file: source.file, line: lineOf(source.sourceFile, tag), rule },
  ];
}
