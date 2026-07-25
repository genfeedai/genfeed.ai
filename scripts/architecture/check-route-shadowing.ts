/**
 * Route shadowing guard.
 *
 * Nest resolves routes in **declaration order** within a controller, so a
 * wildcard param route declared above a static sibling silently swallows it:
 *
 *   @Get(':memberId')   // declared first — matches "/members/invitations"
 *   @Get('invitations') // unreachable, and the handler is dead code
 *
 * Nothing catches this. The shadowed handler still compiles, its unit tests
 * still pass (they call the method directly), and the endpoint quietly returns
 * whatever the wildcard handler does with a non-id path segment — a 404 in the
 * `/members/invitations` case, but potentially a wrong-entity read elsewhere.
 * Type-check cannot see it because route order is metadata, not types.
 *
 * The guard reads the decorator metadata off each controller class and reports
 * any route that an earlier same-method route would consume first. Fix by
 * moving wildcard param routes to the bottom of the class.
 *
 * Known limits (deliberate — they trade recall for zero false positives):
 * - Only compares routes declared in the *same* class. Nest walks the own
 *   prototype before base-class methods, so a subclass static route is never
 *   shadowed by an inherited wildcard.
 * - Skips routes whose path argument is not a literal.
 * - Does not model optional params (`:id?`) expanding to two path shapes.
 *
 * Escape hatch: a `route-shadowing-ok:` comment above the handler, with a
 * reason.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const DEFAULT_INCLUDE_GLOBS = [
  'apps/server/**/*.ts',
  'ee/**/*.ts',
  'packages/libs/**/*.ts',
];

const DEFAULT_IGNORE_GLOBS = [
  '**/*.spec.ts',
  '**/*.test.ts',
  '**/__fixtures__/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/fixtures/**',
  '**/generated/**',
];

const SUPPRESSION_COMMENT = 'route-shadowing-ok';

/** Route decorators exported by `@nestjs/common`. */
const HTTP_METHOD_DECORATORS = new Set([
  'All',
  'Delete',
  'Get',
  'Head',
  'Options',
  'Patch',
  'Post',
  'Put',
  'Search',
]);

export type RouteDeclaration = {
  className: string;
  file: string;
  handler: string;
  httpMethod: string;
  line: number;
  path: string;
};

export type RouteShadowingViolation = {
  shadowed: RouteDeclaration;
  shadowedBy: RouteDeclaration;
};

export type RouteShadowingOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type RouteShadowingResult = {
  filesScanned: number;
  routesScanned: number;
  violations: RouteShadowingViolation[];
};

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

function segments(routePath: string): string[] {
  return routePath.split('/').filter(Boolean);
}

/** `:id`, `:id?`, and the path-to-regexp v8 spellings Nest 11 accepts. */
function isParamSegment(segment: string): boolean {
  return segment.startsWith(':') || segment.startsWith('{:');
}

/** A splat consumes every remaining segment rather than exactly one. */
function isSplatSegment(segment: string): boolean {
  return segment.startsWith('*') || segment.startsWith('{*');
}

/**
 * Would `earlierPath`, declared first, consume a request meant for `laterPath`?
 *
 * True only when a wildcard segment sits where the later route expects a
 * literal. Two param routes of the same shape (`:id` vs `:slug`) are a
 * different bug, and divergent literals never overlap.
 */
export function shadows(earlierPath: string, laterPath: string): boolean {
  const earlier = segments(earlierPath);
  const later = segments(laterPath);

  let coversLiteral = false;

  for (let index = 0; index < earlier.length; index += 1) {
    const earlierSegment = earlier[index];

    if (isSplatSegment(earlierSegment)) {
      // Everything sharing the prefix matched so far is unreachable, as long as
      // the splat has at least one segment left to consume.
      return later.length > index;
    }

    const laterSegment = later[index];

    if (laterSegment === undefined) {
      return false;
    }

    if (isParamSegment(earlierSegment)) {
      if (!isParamSegment(laterSegment) && !isSplatSegment(laterSegment)) {
        coversLiteral = true;
      }
      continue;
    }

    if (earlierSegment !== laterSegment) {
      return false;
    }
  }

  return coversLiteral && earlier.length === later.length;
}

function conflictingMethods(earlier: string, later: string): boolean {
  return earlier === later || earlier === 'All' || later === 'All';
}

/** Local names of `@nestjs/common` route decorators imported by this file. */
function collectRouteDecoratorNames(
  sourceFile: ts.SourceFile,
): Map<string, string> {
  const localNames = new Map<string, string>();

  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== '@nestjs/common' ||
      !statement.importClause?.namedBindings
    ) {
      continue;
    }

    const { namedBindings } = statement.importClause;

    if (!ts.isNamedImports(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;

      if (HTTP_METHOD_DECORATORS.has(importedName)) {
        localNames.set(element.name.text, importedName);
      }
    }
  }

  return localNames;
}

/**
 * Every path a route decorator declares. `@Get()` declares the empty path and
 * `@Get(['a', 'b'])` declares two; a non-literal argument yields none, so the
 * route drops out of the comparison rather than being guessed at.
 */
function routePathsFromDecorator(expression: ts.CallExpression): string[] {
  const [argument] = expression.arguments;

  if (argument === undefined) {
    return [''];
  }

  if (ts.isStringLiteralLike(argument)) {
    return [argument.text];
  }

  if (ts.isArrayLiteralExpression(argument)) {
    return argument.elements.every((element) => ts.isStringLiteralLike(element))
      ? argument.elements.map((element) => (element as ts.StringLiteral).text)
      : [];
  }

  return [];
}

function isSuppressed(node: ts.Node, sourceText: string): boolean {
  const commentRanges =
    ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? [];

  return commentRanges.some((range) =>
    sourceText.slice(range.pos, range.end).includes(SUPPRESSION_COMMENT),
  );
}

function memberName(node: ts.MethodDeclaration): string {
  return ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name)
    ? node.name.text
    : node.name.getText();
}

/**
 * Routes declared per class, in source order — which is the order Nest's
 * metadata scanner walks them in.
 */
export function collectRoutes(
  sourceText: string,
  file: string,
): RouteDeclaration[][] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const routeDecoratorNames = collectRouteDecoratorNames(sourceFile);

  if (routeDecoratorNames.size === 0) {
    return [];
  }

  const classes: RouteDeclaration[][] = [];

  function visitClass(node: ts.ClassDeclaration): void {
    const className = node.name?.text ?? '(anonymous)';
    const routes: RouteDeclaration[] = [];

    for (const member of node.members) {
      if (!ts.isMethodDeclaration(member) || isSuppressed(member, sourceText)) {
        continue;
      }

      const decorators = ts.canHaveDecorators(member)
        ? (ts.getDecorators(member) ?? [])
        : [];

      for (const decorator of decorators) {
        const { expression } = decorator;

        if (
          !ts.isCallExpression(expression) ||
          !ts.isIdentifier(expression.expression)
        ) {
          continue;
        }

        const httpMethod = routeDecoratorNames.get(expression.expression.text);

        if (httpMethod === undefined) {
          continue;
        }

        const line =
          sourceFile.getLineAndCharacterOfPosition(
            decorator.getStart(sourceFile),
          ).line + 1;

        for (const routePath of routePathsFromDecorator(expression)) {
          routes.push({
            className,
            file,
            handler: memberName(member),
            httpMethod,
            line,
            path: routePath,
          });
        }
      }
    }

    if (routes.length > 0) {
      classes.push(routes);
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node)) {
      visitClass(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return classes;
}

/** Every route consumed by an earlier sibling, reported against the first one. */
export function findShadowedRoutes(
  routes: RouteDeclaration[],
): RouteShadowingViolation[] {
  const violations: RouteShadowingViolation[] = [];

  for (let later = 1; later < routes.length; later += 1) {
    const shadowed = routes[later];

    for (let earlier = 0; earlier < later; earlier += 1) {
      const candidate = routes[earlier];

      if (
        candidate.path === shadowed.path ||
        !conflictingMethods(candidate.httpMethod, shadowed.httpMethod) ||
        !shadows(candidate.path, shadowed.path)
      ) {
        continue;
      }

      violations.push({ shadowed, shadowedBy: candidate });
      break;
    }
  }

  return violations;
}

export function runCheckRouteShadowing(
  options: RouteShadowingOptions = {},
): RouteShadowingResult {
  const rootDir = options.rootDir ?? process.cwd();
  const includeGlobs = options.includeGlobs ?? DEFAULT_INCLUDE_GLOBS;
  const ignoreGlobs = options.ignoreGlobs ?? DEFAULT_IGNORE_GLOBS;

  const files = globSync(includeGlobs, {
    absolute: true,
    cwd: rootDir,
    ignore: ignoreGlobs,
    nodir: true,
  }).sort();

  const violations: RouteShadowingViolation[] = [];
  let filesScanned = 0;
  let routesScanned = 0;

  for (const filePath of files) {
    const sourceText = readFileSync(filePath, 'utf8');

    // Cheap pre-filter: parsing every server file is the expensive part.
    if (!sourceText.includes('@nestjs/common')) {
      continue;
    }

    const classes = collectRoutes(
      sourceText,
      normalizePath(path.relative(rootDir, filePath)),
    );

    if (classes.length === 0) {
      continue;
    }

    filesScanned += 1;

    for (const routes of classes) {
      routesScanned += routes.length;
      violations.push(...findShadowedRoutes(routes));
    }
  }

  return { filesScanned, routesScanned, violations };
}

function formatRoute(route: RouteDeclaration): string {
  return `@${route.httpMethod}('${route.path}') ${route.className}.${route.handler} (${route.file}:${route.line})`;
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const result = runCheckRouteShadowing();

  if (result.violations.length > 0) {
    console.error('Unreachable routes found — an earlier route consumes them.');

    for (const violation of result.violations) {
      console.error(`- ${formatRoute(violation.shadowed)}`);
      console.error(`  shadowed by ${formatRoute(violation.shadowedBy)}`);
    }

    console.error(
      '\nNest matches routes in declaration order. Move wildcard param routes below every static sibling path in the same controller.',
    );
    process.exit(1);
  }

  console.log(
    `Route shadowing guard passed. ${result.routesScanned} route(s) across ${result.filesScanned} controller file(s).`,
  );
}
