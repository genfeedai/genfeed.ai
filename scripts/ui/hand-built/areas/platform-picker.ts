import ts from 'typescript';
import type { HandBuiltArea, HandBuiltSource } from '../core';
import { finding, SHARED_PACKAGE, tagNameOf, walkJsx } from '../jsx';

/**
 * A list of platforms, channels or accounts is picked by its avatar, never by
 * its name alone: `AccountPicker` (`@ui/display/connected-account`) for a row,
 * a `Select`/`SegmentedControl` whose options carry an `icon` otherwise.
 *
 * Rule `platform-picker-text`: a `SegmentedControl`, `OptionTileGroup`,
 * `Select` or `Tabs` whose `options`/`items` are built from platforms,
 * channels or accounts, and whose options set no `icon`, `avatar` or `logo`.
 * For a list that is not about where content goes (a metric per platform),
 * add `ui-guard-allow:platform-picker-text -- <reason>`.
 */
const CHOICE_TAGS = new Set([
  'OptionTileGroup',
  'SegmentedControl',
  'Select',
  'Tabs',
]);
const OPTION_PROPS = new Set(['items', 'options']);
const PLATFORM_WORD =
  /\b(platforms?|channels?|accounts?|credentials?)\b|[a-z](Platforms?|Channels?|Accounts?|Credentials?)\b|^(PLATFORMS?|CHANNELS?|ACCOUNTS?)\b|\bPLATFORM/;
const VISUAL_WORD =
  /\b(icon|avatar|logo|Icon|Avatar|Logo)\b|\b\w+(Icon|Avatar|Logo)\b|<\w*(Icon|Avatar|Logo)/;

function declarationText(source: HandBuiltSource, name: string): string | null {
  let found: string | null = null;
  const visit = (node: ts.Node): void => {
    if (
      found === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      found = node.initializer.getText(source.sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source.sourceFile);
  return found;
}

const area: HandBuiltArea = {
  id: 'platform-picker',
  scan: (source) => {
    if (SHARED_PACKAGE.test(source.file)) {
      return [];
    }
    const findings: ReturnType<HandBuiltArea['scan']> = [];
    walkJsx(source, (tag) => {
      if (!CHOICE_TAGS.has(tagNameOf(source, tag))) {
        return;
      }
      for (const attribute of tag.attributes.properties) {
        if (
          !ts.isJsxAttribute(attribute) ||
          !OPTION_PROPS.has(attribute.name.getText(source.sourceFile)) ||
          !attribute.initializer ||
          !ts.isJsxExpression(attribute.initializer) ||
          !attribute.initializer.expression
        ) {
          continue;
        }
        const expression = attribute.initializer.expression;
        const text = ts.isIdentifier(expression)
          ? `${expression.text} ${declarationText(source, expression.text) ?? ''}`
          : expression.getText(source.sourceFile);
        if (PLATFORM_WORD.test(text) && !VISUAL_WORD.test(text)) {
          findings.push(
            ...finding(
              source,
              tag,
              'platform-picker-text',
              'Platforms, channels or accounts are picked by avatar. Use AccountPicker (@ui/display/connected-account), or give each option an icon.',
            ),
          );
        }
      }
    });
    return findings;
  },
};

export default area;
