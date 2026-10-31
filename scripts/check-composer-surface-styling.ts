import { readFileSync } from 'node:fs';
import { globSync } from 'glob';
import ts from 'typescript';
import {
  parseSourceFile,
  scriptKindFor,
} from './architecture/parse-source-file';

/**
 * The composer surface is owned by PROMPT_BAR_SURFACE_CLASS in
 * packages/ui/src/components/prompt-bars/components/shell/PromptBarShell.tsx.
 *
 * Agent once passed `border border-border-strong/70 !shadow-none` straight into
 * PromptBarComposer instead of changing that constant. Agent then rendered as
 * bordered glass while Studio Generate, the base PromptBar and the image-to-video
 * modal kept the old borderless drop shadow — three call sites, three looks, and
 * a Studio composer that read as having lost its border.
 *
 * A call site may still position, size or tint its composer, and may square one
 * edge for adjacency (`rounded-t-none`). It may not restate the surface itself,
 * so border/shadow/radius/backdrop belong to the shared constant only.
 *
 * The owners themselves are checked too: a prompt bar is flat. The "remove the
 * shadow" fix of 2026-10-19 only dropped `shadow-composer` from the surface and
 * left the container's top-fade gradient (`showTopFade`) in place, so the
 * storyboard bar still read as shadowed. No shadow, gradient or fade may be
 * (re)introduced on the composer container or surface.
 */

const logger = {
  error: (message: string) =>
    console.error(`[CheckComposerSurfaceStyling] ${message}`),
  log: (message: string) =>
    console.log(`[CheckComposerSurfaceStyling] ${message}`),
};

const INCLUDE_GLOBS = ['apps/web/**/*.{tsx,jsx}', 'packages/**/*.{tsx,jsx}'];

/** Includes .ts/.js so prop contracts and helpers are scanned for the removed fade API. */
const SOURCE_GLOBS = [
  'apps/web/**/*.{ts,tsx,js,jsx}',
  'packages/**/*.{ts,tsx,js,jsx}',
];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/dist/**',
  '**/node_modules/**',
  // The shell owns the surface; it is the one place these classes belong.
  'packages/ui/src/components/prompt-bars/components/shell/**',
  // The marketing site renders a stylised mock of the composer for a dark
  // landing page. It is a picture of the product, not a product surface, so it
  // does not participate in app composer consistency.
  'apps/marketing/**',
];

/** Components whose className lands on the shared composer surface. */
const SURFACE_COMPONENTS = new Set(['PromptBarComposer', 'PromptBarShell']);

/**
 * Surface-defining utilities. `ring-` is deliberately absent: call sites use it
 * for transient drag/focus affordances layered over the surface, not to define
 * it.
 */
const FORBIDDEN_CLASS_PATTERN =
  /(^|[\s!])!?(border(?![a-z])|border-[a-z0-9[]|shadow-|rounded-(?!\w{1,2}-none(?:$|\s))|backdrop-blur|backdrop-saturate)/;

/** Files that own the composer container and surface. */
const FLAT_OWNER_GLOBS = [
  'packages/ui/src/components/layout/prompt-bar-container/*.tsx',
  'packages/ui/src/components/prompt-bars/components/shell/*.tsx',
];

const FLAT_OWNER_EXCLUDE_GLOBS = ['**/*.test.*', '**/*.spec.*'];

/** Shadow, gradient and scrim utilities a flat composer owner may not use. */
const FLAT_FORBIDDEN_CLASS_PATTERN =
  /(^|[\s:!])!?(shadow(?![a-z])|shadow-|drop-shadow|bg-gradient|bg-linear|bg-radial|bg-\[[^\]]*gradient|from-|via-)/;

/** The removed top-fade API must not come back anywhere in product source. */
const REMOVED_FADE_PATTERN =
  /showTopFade|topFadeClassName|data-composer-top-fade/;

interface IViolation {
  file: string;
  line: number;
  component: string;
  snippet: string;
}

function collectStringLiterals(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      out.push(span.literal.text);
    }
  }
  ts.forEachChild(node, (child) => collectStringLiterals(child, out));
}

function findViolations(file: string): IViolation[] {
  const source = parseSourceFile(
    file,
    readFileSync(file, 'utf8'),
    true,
    scriptKindFor(file),
  );

  const violations: IViolation[] = [];

  const visit = (node: ts.Node): void => {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : undefined;

    if (opening && SURFACE_COMPONENTS.has(opening.tagName.getText(source))) {
      for (const attribute of opening.attributes.properties) {
        if (
          !ts.isJsxAttribute(attribute) ||
          attribute.name.getText(source) !== 'className' ||
          !attribute.initializer
        ) {
          continue;
        }

        const literals: string[] = [];
        collectStringLiterals(attribute.initializer, literals);

        for (const literal of literals) {
          if (!FORBIDDEN_CLASS_PATTERN.test(literal)) {
            continue;
          }

          violations.push({
            component: opening.tagName.getText(source),
            file,
            line:
              source.getLineAndCharacterOfPosition(attribute.getStart(source))
                .line + 1,
            snippet: literal.trim().slice(0, 80),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return violations;
}

function findFlatOwnerViolations(file: string): IViolation[] {
  const source = parseSourceFile(
    file,
    readFileSync(file, 'utf8'),
    true,
    scriptKindFor(file),
  );
  const violations: IViolation[] = [];

  const visit = (node: ts.Node): void => {
    const literals: string[] = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      literals.push(node.text);
    }
    if (ts.isTemplateExpression(node)) {
      literals.push(
        node.head.text,
        ...node.templateSpans.map((span) => span.literal.text),
      );
    }
    for (const literal of literals) {
      if (FLAT_FORBIDDEN_CLASS_PATTERN.test(literal)) {
        violations.push({
          component: 'composer owner',
          file,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          snippet: literal.trim().slice(0, 80),
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return violations;
}

function findRemovedFadeUsages(file: string): IViolation[] {
  const lines = readFileSync(file, 'utf8').split('\n');
  return lines.flatMap((line, index) =>
    REMOVED_FADE_PATTERN.test(line)
      ? [
          {
            component: 'removed top fade',
            file,
            line: index + 1,
            snippet: line.trim().slice(0, 80),
          },
        ]
      : [],
  );
}

const files = globSync(INCLUDE_GLOBS, { ignore: EXCLUDE_GLOBS, nodir: true });
const sourceFiles = globSync(SOURCE_GLOBS, {
  ignore: EXCLUDE_GLOBS,
  nodir: true,
});
const ownerFiles = globSync(FLAT_OWNER_GLOBS, {
  ignore: FLAT_OWNER_EXCLUDE_GLOBS,
  nodir: true,
});
const violations = [
  ...files.flatMap(findViolations),
  ...ownerFiles.flatMap(findFlatOwnerViolations),
  ...sourceFiles.flatMap(findRemovedFadeUsages),
];

if (violations.length > 0) {
  logger.error(
    `Found ${violations.length} composer surface violation(s). The surface is defined once, in PROMPT_BAR_SURFACE_CLASS, and prompt bars carry no shadow, gradient or fade:`,
  );
  for (const violation of violations) {
    logger.error(
      `  ${violation.file}:${violation.line} <${violation.component} className="${violation.snippet}">`,
    );
  }
  logger.error(
    'Change PROMPT_BAR_SURFACE_CLASS so every composer moves together, or use a class that does not define the surface.',
  );
  process.exit(1);
}

logger.log('No composer surface violations found.');
