/**
 * Hand-built avatars guard.
 *
 * `Avatar` (`@ui/primitives/avatar`) is the one avatar: a size scale, circle or
 * square shape, initials from `getInitials()`, a corner badge and an overlay
 * slot. This guard blocks the three ways of going around it:
 *
 *   - `avatar-restyle`   `<Avatar className="size-7 rounded-xl bg-card …">`:
 *                        size, shape and colour are props, not classes. Layout
 *                        classes (margin, position, flex item, aspect) stay.
 *   - `hand-built-avatar` a `div`/`span`/`img`/`Image` that is a fixed-size
 *                        rounded frame around a letter or a picture.
 *   - `private-initials` a local initials function or variable; the rule lives
 *                        in `getInitials()` (`@genfeedai/helpers`).
 *
 * Escape hatch, on the offending line or the line above:
 *   // ui-guard-allow:<rule> -- <reason>
 * `design-system-allow-content-color` does not silence this guard.
 *
 * The baseline (`avatars.baseline.json`) lists tolerated spots as
 * `<file>#<rule>` with a count. It may only shrink: a new spot fails, and so
 * does an entry that no longer matches, so the number ratchets down. It is
 * empty today.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';
import ts from 'typescript';
import { parseSourceFile } from '../../architecture/parse-source-file';

export type AvatarRule =
  | 'avatar-restyle'
  | 'hand-built-avatar'
  | 'private-initials';

export interface AvatarViolation {
  file: string;
  line: number;
  message: string;
  rule: AvatarRule;
}

export type AvatarBaseline = Record<string, number>;

const SCAN_ROOTS = ['apps', 'packages'];
const EXCLUDED_SEGMENTS = [
  '/node_modules/',
  '/dist/',
  '/.next/',
  '/__mocks__/',
  '/.turbo/',
];
/** Where the avatar and its initials rule are implemented. */
const OWNER_PREFIXES = [
  'packages/ui/src/primitives/avatar',
  'packages/helpers/src/formatting/initials/',
];
const BASELINE_PATH = fileURLToPath(
  new URL('./avatars.baseline.json', import.meta.url),
);

/** Classes that restyle the avatar; the component owns these. */
const RESTYLE_BASE =
  /^(size|w|h|min-w|min-h|max-w|max-h|rounded|bg|text|font|border|shadow|ring|outline|opacity|p[xytblr]?|leading|tracking|uppercase|lowercase|capitalize|object|overflow)(-|$)/;
const FRAME_TAGS = new Set(['div', 'span', 'img', 'Image']);
const MIN_FRAME_UNITS = 4;
const MAX_FRAME_UNITS = 40;
const LETTER_EXPRESSION = /charAt\(|\[0\]|[Ii]nitial/;
/** `initials`, `getInitials`, `reviewerInitials`: a function or value of initials. */
const INITIALS_NAME = /initials$/i;
/** `const initial = name.charAt(0).toUpperCase()`: one avatar letter, derived by hand. */
const INITIAL_NAME = /^initial$/i;
const LETTER_DERIVATION =
  /(charAt\(0\)|\[0\]\??)\.?\s*(toUpperCase|toLocaleUpperCase)\(/;

function isTestLike(rel: string): boolean {
  return rel.includes('.test.') || rel.includes('.spec.');
}

function isScanned(rel: string): boolean {
  const withSlash = `/${rel}`;
  return (
    /\.tsx?$/.test(rel) &&
    !rel.endsWith('.d.ts') &&
    !isTestLike(rel) &&
    !EXCLUDED_SEGMENTS.some((segment) => withSlash.includes(segment)) &&
    !OWNER_PREFIXES.some((prefix) => rel.startsWith(prefix))
  );
}

function baseOf(token: string): string {
  return token.slice(token.lastIndexOf(':') + 1).replace(/^!|!$/g, '');
}

/** Every string a className expression can produce, split into classes. */
function classTokens(initializer: ts.JsxAttributeValue | undefined): string[] {
  if (!initializer) {
    return [];
  }
  const tokens: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      tokens.push(...node.text.split(/\s+/).filter(Boolean));
    } else if (ts.isTemplateExpression(node)) {
      tokens.push(...node.head.text.split(/\s+/).filter(Boolean));
      for (const span of node.templateSpans) {
        tokens.push(...span.literal.text.split(/\s+/).filter(Boolean));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return tokens.map(baseOf);
}

function classNameOf(element: ts.JsxOpeningLikeElement): string[] {
  for (const attribute of element.attributes.properties) {
    if (
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === 'className'
    ) {
      return classTokens(attribute.initializer);
    }
  }
  return [];
}

function srcOf(element: ts.JsxOpeningLikeElement): string {
  for (const attribute of element.attributes.properties) {
    if (ts.isJsxAttribute(attribute) && attribute.name.getText() === 'src') {
      return attribute.initializer?.getText() ?? '';
    }
  }
  return '';
}

function frameUnits(tokens: string[]): number | null {
  for (const token of tokens) {
    const match = /^size-(\d+(?:\.\d+)?)$/.exec(token);
    if (match) {
      const units = Number(match[1]);
      if (units >= MIN_FRAME_UNITS && units <= MAX_FRAME_UNITS) {
        return units;
      }
    }
  }
  return null;
}

function hasToken(tokens: string[], pattern: RegExp): boolean {
  return tokens.some((token) => pattern.test(token));
}

function containsPictureOrLetter(element: ts.JsxElement): boolean {
  let isFound = false;
  const visit = (node: ts.Node): void => {
    if (isFound) {
      return;
    }
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ['img', 'Image'].includes(node.tagName.getText())
    ) {
      isFound = true;
      return;
    }
    if (ts.isJsxExpression(node) && node.expression) {
      if (LETTER_EXPRESSION.test(node.expression.getText())) {
        isFound = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  for (const child of element.children) {
    visit(child);
  }
  return isFound;
}

function isAllowed(lines: string[], line: number, rule: AvatarRule): boolean {
  const marker = new RegExp(`ui-guard-allow:${rule}\\s+--\\s+\\S`);
  return [lines[line - 1], lines[line - 2]].some(
    (text) => text !== undefined && marker.test(text),
  );
}

export function detectInFile(rel: string, content: string): AvatarViolation[] {
  const sourceFile = parseSourceFile(rel, content);
  const lines = content.split('\n');
  const found: AvatarViolation[] = [];

  const report = (node: ts.Node, rule: AvatarRule, message: string): void => {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;
    if (!isAllowed(lines, line, rule)) {
      found.push({ file: rel, line, message, rule });
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      const tokens = classNameOf(node);

      if (tag === 'Avatar') {
        const restyles = tokens.filter((token) => RESTYLE_BASE.test(token));
        if (restyles.length > 0) {
          report(
            node,
            'avatar-restyle',
            `<Avatar> is restyled with className (${restyles.join(' ')}). Use size, shape and name/src; layout classes only.`,
          );
        }
      } else if (FRAME_TAGS.has(tag) && frameUnits(tokens) !== null) {
        const isPicture = tag === 'img' || tag === 'Image';
        // A picture with a corner radius is only an avatar when it is a person
        // or a logo; a square thumbnail of generated media is not.
        const isRounded = isPicture
          ? tokens.includes('rounded-full') ||
            (hasToken(tokens, /^rounded(-(sm|md|lg|xl))?$/) &&
              /logo|avatar|profile/i.test(srcOf(node)))
          : tokens.includes('rounded-full');
        const isFramed = isPicture
          ? tokens.includes('object-cover')
          : hasToken(tokens, /^bg-/) &&
            (tokens.includes('overflow-hidden') ||
              hasToken(
                tokens,
                /^(items|justify|content)-center$|^text-center$/,
              )) &&
            ts.isJsxOpeningElement(node) &&
            ts.isJsxElement(node.parent) &&
            containsPictureOrLetter(node.parent);

        if (isRounded && isFramed) {
          report(
            node,
            'hand-built-avatar',
            `<${tag}> is a hand-built avatar frame. Use <Avatar name src size shape>.`,
          );
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name) {
      if (INITIALS_NAME.test(node.name.text)) {
        report(
          node.name,
          'private-initials',
          `${node.name.text}() derives initials locally. Use getInitials() from @genfeedai/helpers, or pass name to <Avatar>.`,
        );
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      !/getInitials\(/.test(node.initializer.getText()) &&
      (INITIALS_NAME.test(node.name.text) ||
        (INITIAL_NAME.test(node.name.text) &&
          LETTER_DERIVATION.test(node.initializer.getText())))
    ) {
      report(
        node.name,
        'private-initials',
        `${node.name.text} derives initials locally. Use getInitials() from @genfeedai/helpers, or pass name to <Avatar>.`,
      );
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return found;
}

export function detectAvatarViolations(
  files: string[],
  rootDir: string,
): AvatarViolation[] {
  const violations: AvatarViolation[] = [];
  for (const rel of files.map((file) => file.replaceAll('\\', '/'))) {
    if (isScanned(rel)) {
      violations.push(
        ...detectInFile(rel, readFileSync(path.join(rootDir, rel), 'utf8')),
      );
    }
  }
  return violations;
}

/** Violations beyond the baseline, and baseline entries nothing matches any more. */
export function compareToBaseline(
  violations: AvatarViolation[],
  baseline: AvatarBaseline,
): { excess: AvatarViolation[]; stale: string[] } {
  const counts = new Map<string, AvatarViolation[]>();
  for (const violation of violations) {
    const key = `${violation.file}#${violation.rule}`;
    counts.set(key, [...(counts.get(key) ?? []), violation]);
  }
  const excess: AvatarViolation[] = [];
  for (const [key, list] of counts) {
    excess.push(...list.slice(baseline[key] ?? 0));
  }
  const stale = Object.entries(baseline)
    .filter(([key, allowed]) => (counts.get(key)?.length ?? 0) < allowed)
    .map(([key]) => key);
  return { excess, stale };
}

function discoverFiles(rootDir: string): string[] {
  return globSync(
    SCAN_ROOTS.map((root) => `${root}/**/*.{ts,tsx}`),
    {
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    },
  );
}

export function runAvatarGuard(
  rootDir: string,
  baseline: AvatarBaseline,
  files?: string[],
): number {
  const violations = detectAvatarViolations(
    files ?? discoverFiles(rootDir),
    rootDir,
  );
  const { excess, stale } = compareToBaseline(violations, baseline);

  for (const violation of excess) {
    console.error(
      `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`,
    );
  }
  // Staged-file runs see only some files, so stale baseline entries are
  // only judged on a full scan.
  if (!files) {
    for (const key of stale) {
      console.error(
        `avatars.baseline.json: ${key} is fixed. Remove it so the baseline only shrinks.`,
      );
    }
  }
  return excess.length > 0 || (!files && stale.length > 0) ? 1 : 0;
}

if (import.meta.main) {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
    allowed: AvatarBaseline;
  };
  const files = process.argv
    .slice(2)
    .map((file) => path.relative(process.cwd(), path.resolve(file)));
  process.exit(
    runAvatarGuard(
      process.cwd(),
      baseline.allowed,
      files.length > 0 ? files : undefined,
    ),
  );
}
