/**
 * Route shadowing guard.
 *
 * Two independent checks, both about a route that compiles, tests green, and
 * never receives the request it was written for.
 *
 * ## 1. In-controller shadowing (declaration order)
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
 *
 * ## 2. Cross-controller collisions (registration order)
 *
 * The same failure across two controllers that mount the same prefix. Express
 * serves whichever module `AppModule` registers first, and the loser's routes
 * are unreachable:
 *
 *   @Controller('runs') class AgentRunsController { @Get() ... }  // wins
 *   @Controller('runs') class RunsController      { @Get() ... }  // dead
 *
 * This is worse than the in-controller case: the two controllers usually back
 * different models, so callers get a well-formed 200 carrying the wrong
 * entity. Splitting a controller across several classes on one prefix is a
 * normal pattern here (36 prefixes are shared), so only an identical
 * method + full path counts — param *names* are normalised away, since
 * `/runs/:id` and `/runs/:runId` are the same route to Express.
 *
 * Routes inherited from an abstract base (`BaseCRUDController` and its 30-odd
 * subclasses) are included: the base declares `@Post()` and `@Patch(':id')`,
 * so a subclass collides on paths that appear nowhere in its own source.
 * Bases are resolved by class name across the scanned tree, and skipped when
 * the name is ambiguous.
 *
 * Escape hatch: the same `route-shadowing-ok:` comment, on the handler or on
 * the class.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import ts from 'typescript';

const DEFAULT_INCLUDE_GLOBS = ['apps/server/**/*.ts', 'packages/libs/**/*.ts'];

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

/** A controller class, with the prefix it mounts and the base it extends. */
export type ControllerClass = {
  baseClassName: string | null;
  className: string;
  file: string;
  /** Every prefix from `@Controller(...)`; empty when undecorated (a base). */
  prefixes: string[];
  routes: RouteDeclaration[];
};

/** One full path+method claimed by more than one controller. */
export type RouteCollisionViolation = {
  claimants: RouteDeclaration[];
  httpMethod: string;
  path: string;
};

export type RouteShadowingOptions = {
  ignoreGlobs?: string[];
  includeGlobs?: string[];
  rootDir?: string;
};

export type RouteShadowingResult = {
  collisions: RouteCollisionViolation[];
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
 * Whether the file imports `Controller` from `@nestjs/common`.
 *
 * A subclass of `BaseCRUDController` can mount a prefix and declare no route
 * of its own — `tags` and `musics` both do. Such a file imports no HTTP method
 * decorator, so route-decorator detection alone would skip it and its
 * inherited claims would never be compared against anyone else's.
 */
function importsControllerDecorator(sourceFile: ts.SourceFile): boolean {
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
      if ((element.propertyName?.text ?? element.name.text) === 'Controller') {
        return true;
      }
    }
  }

  return false;
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
 * The paths a `@Controller(...)` decorator mounts. Accepts the string, array,
 * and `{ path }` object forms; a non-literal prefix yields none, which drops
 * the class from the collision comparison rather than guessing at it.
 */
function controllerPrefixes(node: ts.ClassDeclaration): string[] {
  const decorators = ts.canHaveDecorators(node)
    ? (ts.getDecorators(node) ?? [])
    : [];

  for (const decorator of decorators) {
    const { expression } = decorator;

    if (
      !ts.isCallExpression(expression) ||
      !ts.isIdentifier(expression.expression) ||
      expression.expression.text !== 'Controller'
    ) {
      continue;
    }

    const [argument] = expression.arguments;

    if (argument === undefined) {
      return [''];
    }

    if (ts.isStringLiteralLike(argument)) {
      return [argument.text];
    }

    if (ts.isArrayLiteralExpression(argument)) {
      return argument.elements.every((element) =>
        ts.isStringLiteralLike(element),
      )
        ? argument.elements.map((element) => (element as ts.StringLiteral).text)
        : [];
    }

    if (ts.isObjectLiteralExpression(argument)) {
      for (const property of argument.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === 'path' &&
          ts.isStringLiteralLike(property.initializer)
        ) {
          return [property.initializer.text];
        }
      }
    }

    return [];
  }

  return [];
}

/** The name of the class in `extends X`, when it is a plain identifier. */
function baseClassName(node: ts.ClassDeclaration): string | null {
  const extendsClause = node.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );

  const [type] = extendsClause?.types ?? [];

  return type !== undefined && ts.isIdentifier(type.expression)
    ? type.expression.text
    : null;
}

/**
 * Routes declared per class, in source order — which is the order Nest's
 * metadata scanner walks them in.
 */
export function collectRoutes(
  sourceText: string,
  file: string,
): RouteDeclaration[][] {
  return collectControllers(sourceText, file)
    .map((controller) => controller.routes)
    .filter((routes) => routes.length > 0);
}

/** Every class in the file that declares routes or mounts a controller prefix. */
export function collectControllers(
  sourceText: string,
  file: string,
): ControllerClass[] {
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const routeDecoratorNames = collectRouteDecoratorNames(sourceFile);

  if (
    routeDecoratorNames.size === 0 &&
    !importsControllerDecorator(sourceFile)
  ) {
    return [];
  }

  const classes: ControllerClass[] = [];

  function visitClass(node: ts.ClassDeclaration): void {
    const className = node.name?.text ?? '(anonymous)';

    if (isSuppressed(node, sourceText)) {
      return;
    }

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

    const prefixes = controllerPrefixes(node);

    if (routes.length > 0 || prefixes.length > 0) {
      classes.push({
        baseClassName: baseClassName(node),
        className,
        file,
        prefixes,
        routes,
      });
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

/**
 * `runs` + `:id` -> `runs/:param`. Param names are cosmetic to Express, so
 * `/runs/:id` and `/runs/:runId` must compare equal.
 */
export function normalizeFullPath(prefix: string, routePath: string): string {
  return [...segments(prefix), ...segments(routePath)]
    .map((segment) => {
      if (isSplatSegment(segment)) {
        return '*';
      }

      return isParamSegment(segment) ? ':param' : segment;
    })
    .join('/');
}

/** Guards against a cycle in a malformed `extends` chain. */
const MAX_INHERITANCE_DEPTH = 8;

/**
 * A controller's own routes plus every route it inherits. Own routes come
 * first, matching Nest's prototype walk.
 *
 * Bases are looked up by class name across the whole scanned tree, which
 * avoids resolving tsconfig path aliases. A name declared by more than one
 * class is ambiguous, so it is skipped rather than guessed at.
 */
function routesWithInherited(
  controller: ControllerClass,
  byName: Map<string, ControllerClass[]>,
): RouteDeclaration[] {
  const routes = [...controller.routes];
  const visited = new Set<string>([controller.className]);

  let current = controller;

  for (let depth = 0; depth < MAX_INHERITANCE_DEPTH; depth += 1) {
    const parentName = current.baseClassName;

    if (parentName === null || visited.has(parentName)) {
      break;
    }

    const candidates = byName.get(parentName);

    // Unknown (out of tree) or ambiguous (same name in two files).
    if (candidates === undefined || candidates.length !== 1) {
      break;
    }

    visited.add(parentName);
    current = candidates[0];
    routes.push(...current.routes);
  }

  return routes;
}

/**
 * The deployable app a controller belongs to, or `null` for shared code.
 *
 * Each `apps/server/*` workspace is its own Nest application on its own port,
 * so `images` and `voices` both serving `POST /train` is not a collision —
 * they never share a route table. Controllers outside an app workspace
 * (`packages/libs/*`) are registered into whichever app imports their
 * module, so they are compared against every app.
 */
export function appRootFor(file: string): string | null {
  const match = /^(apps\/server\/[^/]+|apps\/[^/]+)\//.exec(file);

  return match === null ? null : match[1];
}

/**
 * Every full path+method claimed by more than one controller class, checked
 * per application.
 *
 * Only classes that mount a literal prefix take part — an abstract base
 * contributes its routes to subclasses but never claims a path itself.
 */
export function findRouteCollisions(
  controllers: ControllerClass[],
): RouteCollisionViolation[] {
  const appRoots = new Set<string>();
  const shared: ControllerClass[] = [];

  for (const controller of controllers) {
    const appRoot = appRootFor(controller.file);

    if (appRoot === null) {
      shared.push(controller);
    } else {
      appRoots.add(appRoot);
    }
  }

  const violations: RouteCollisionViolation[] = [];
  const reported = new Set<string>();

  for (const appRoot of [...appRoots].sort()) {
    const scoped = controllers.filter(
      (controller) => appRootFor(controller.file) === appRoot,
    );

    for (const violation of findCollisionsWithin([...scoped, ...shared])) {
      const key = `${violation.httpMethod} ${violation.path} ${violation.claimants
        .map((claimant) => `${claimant.file}:${claimant.line}`)
        .sort()
        .join('|')}`;

      // A shared-vs-shared collision surfaces once per app; report it once.
      if (reported.has(key)) {
        continue;
      }

      reported.add(key);
      violations.push(violation);
    }
  }

  return violations.sort((left, right) =>
    `${left.httpMethod} ${left.path}`.localeCompare(
      `${right.httpMethod} ${right.path}`,
    ),
  );
}

function findCollisionsWithin(
  controllers: ControllerClass[],
): RouteCollisionViolation[] {
  const byName = new Map<string, ControllerClass[]>();

  for (const controller of controllers) {
    const existing = byName.get(controller.className);

    if (existing === undefined) {
      byName.set(controller.className, [controller]);
    } else {
      existing.push(controller);
    }
  }

  /** `METHOD full/path` -> the routes claiming it, one per controller class. */
  const claims = new Map<string, RouteDeclaration[]>();

  for (const controller of controllers) {
    if (controller.prefixes.length === 0) {
      continue;
    }

    const inherited = routesWithInherited(controller, byName);
    // A subclass that overrides an inherited handler declares the same
    // path twice; that is one claim, not a self-collision.
    const claimedByThisClass = new Set<string>();

    for (const prefix of controller.prefixes) {
      for (const route of inherited) {
        const path = normalizeFullPath(prefix, route.path);
        const key = `${route.httpMethod} ${path}`;

        if (claimedByThisClass.has(key)) {
          continue;
        }

        claimedByThisClass.add(key);

        const claimants = claims.get(key);

        if (claimants === undefined) {
          claims.set(key, [{ ...route, className: controller.className }]);
        } else {
          claimants.push({ ...route, className: controller.className });
        }
      }
    }
  }

  const violations: RouteCollisionViolation[] = [];

  for (const [key, claimants] of claims) {
    if (claimants.length < 2) {
      continue;
    }

    const [httpMethod, path] = key.split(' ');

    violations.push({ claimants, httpMethod, path });
  }

  return violations.sort((left, right) =>
    `${left.httpMethod} ${left.path}`.localeCompare(
      `${right.httpMethod} ${right.path}`,
    ),
  );
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
  const controllers: ControllerClass[] = [];
  let filesScanned = 0;
  let routesScanned = 0;

  for (const filePath of files) {
    const sourceText = readFileSync(filePath, 'utf8');

    // Cheap pre-filter: parsing every server file is the expensive part.
    if (!sourceText.includes('@nestjs/common')) {
      continue;
    }

    const classes = collectControllers(
      sourceText,
      normalizePath(path.relative(rootDir, filePath)),
    );

    if (classes.length === 0) {
      continue;
    }

    filesScanned += 1;
    controllers.push(...classes);

    for (const controller of classes) {
      routesScanned += controller.routes.length;
      violations.push(...findShadowedRoutes(controller.routes));
    }
  }

  return {
    collisions: findRouteCollisions(controllers),
    filesScanned,
    routesScanned,
    violations,
  };
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
  let failed = false;

  if (result.violations.length > 0) {
    failed = true;
    console.error('Unreachable routes found — an earlier route consumes them.');

    for (const violation of result.violations) {
      console.error(`- ${formatRoute(violation.shadowed)}`);
      console.error(`  shadowed by ${formatRoute(violation.shadowedBy)}`);
    }

    console.error(
      '\nNest matches routes in declaration order. Move wildcard param routes below every static sibling path in the same controller.',
    );
  }

  if (result.collisions.length > 0) {
    failed = true;
    console.error(
      `${failed && result.violations.length > 0 ? '\n' : ''}Route collisions found — two controllers claim one path.`,
    );

    for (const collision of result.collisions) {
      console.error(`- ${collision.httpMethod} /${collision.path}`);

      for (const claimant of collision.claimants) {
        console.error(`  claimed by ${formatRoute(claimant)}`);
      }
    }

    console.error(
      '\nExpress serves whichever module AppModule registers first; the rest are dead. Give each controller a distinct prefix, or move the overlapping handler onto the controller that owns the path.',
    );
  }

  if (failed) {
    process.exit(1);
  }

  console.log(
    `Route shadowing guard passed. ${result.routesScanned} route(s) across ${result.filesScanned} controller file(s).`,
  );
}
