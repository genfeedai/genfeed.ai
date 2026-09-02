/**
 * Guard: navigation sinks must reference the central `APP_ROUTES` constant tree
 * (and the `createBrandAppRoute` / `createOrganizationAppRoute` builders) rather
 * than hardcoding route-root string literals.
 *
 * The canonical route constants live in
 * `packages/contracts/src/constants/routes.constant.ts`. Restating a route as an inline
 * string (`href="/settings/api-keys"`, `push('/workspace/inbox/unread')`) means a
 * later route rename updates the constant but silently leaves the literal behind.
 *
 * WHAT THIS FLAGS (only navigation sinks — never data/config/comparisons):
 *   - JSX `href` / `to` attributes whose value is a plain string literal (single,
 *     double, or non-interpolated template) beginning with a known route root.
 *   - `push()` / `replace()` / `redirect()` / `assign()` calls whose SOLE argument
 *     is such a string literal.
 *   - Playwright `.goto()` calls and shared route-render helpers whose route is
 *     inside a known app-route family, including dynamic descendants.
 *
 * WHAT THIS DELIBERATELY IGNORES:
 *   - `href={APP_ROUTES.X}` / `push(createBrandAppRoute(...))` — already migrated.
 *   - Object-property route data (`href: '/x'` in menu configs) — not a nav sink.
 *   - `String.prototype.replace('/a', '/b')` — two args, so the literal is not the
 *     sole argument and is left untouched.
 *   - `.startsWith('/x')`, `path === '/x'` — path inspection, not navigation.
 *   - Unit tests, story fixtures, and `routes.constant.ts` itself. Playwright E2E
 *     navigation is checked separately because it exercises the production routes.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import {
  APP_ROUTES,
  LEGACY_APP_ROUTES,
} from '../packages/contracts/src/constants/routes.constant';

const logger = {
  error: (message: string) =>
    console.error(`[CheckHardcodedAppRoutes] ${message}`),
  log: (message: string) => console.log(`[CheckHardcodedAppRoutes] ${message}`),
};

const INCLUDE_GLOBS = [
  'apps/app/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
  'packages/pages/**/*.{ts,tsx}',
];

const PLAYWRIGHT_INCLUDE_GLOBS = ['playwright/e2e/**/*.{ts,tsx}'];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/routes.constant.ts',
  // Marketplace surface — its nav (/free, /prompts, /images, /library, ...) are
  // marketplace-app routes, NOT the studio APP_ROUTES tree. Out of scope here.
  '**/topbars/MarketplaceTopbar.tsx',
  // Public marketing surface — its nav (/studio, /library, /research, ...) are
  // public website landing pages, NOT the studio APP_ROUTES tree (whose roots
  // differ, e.g. LIBRARY.ROOT = /library). Out of scope here.
  '**/topbars/WebsiteTopbar.tsx',
];

/**
 * Top-level route roots that have `APP_ROUTES.*` constants. Keep in sync with the
 * keys of `APP_ROUTES` in `packages/contracts/src/constants/routes.constant.ts`.
 */
const ROUTE_ROOTS = [
  'admin',
  'agent',
  'analytics',
  'compose',
  'discover',
  'lab',
  'library',
  'login',
  'logout',
  'managed-credits',
  'messages',
  'oauth',
  'onboarding',
  'automate',
  'overview',
  'posts',
  'request-access',
  'settings',
  'sign-up',
  'studio',
  'tasks',
  'workflows',
  'workspace',
];

const ROOT_ALTERNATION = ROUTE_ROOTS.join('|');

/**
 * A route-root string literal: a `'`, `"`, or backtick-quoted value that starts
 * with `/<root>` and (for template literals) contains no `${` interpolation
 * before the closing quote.
 */
const ROUTE_LITERAL = `(['"\`])(\\/(?:${ROOT_ALTERNATION})(?:[/?#][^'"\`$]*)?)\\1`;

/**
 * JSX `href` / `to` attribute bound to a route-root literal, either as a bare
 * attribute (`href="/x"`) or a braced expression (`href={'/x'}`).
 */
const JSX_ATTR_PATTERN = new RegExp(
  `\\b(?:href|to)=\\{?\\s*${ROUTE_LITERAL}`,
  'g',
);

/**
 * Navigation call whose SOLE argument is a route-root literal. The trailing `\)`
 * (rather than `,`) excludes two-argument `String.prototype.replace`.
 */
const NAV_CALL_PATTERN = new RegExp(
  `(?:push|replace|redirect|assign)\\(\\s*${ROUTE_LITERAL}\\s*\\)`,
  'g',
);

const PLAYWRIGHT_GOTO_PATTERN = new RegExp(
  `\\.goto\\(\\s*${ROUTE_LITERAL}`,
  'g',
);

const PLAYWRIGHT_ROUTE_HELPER_PATTERN = new RegExp(
  `\\b(?:assertHealthy|assertRouteRenders|goToSettings|navigateTo)\\(\\s*[^,]+,\\s*${ROUTE_LITERAL}`,
  'g',
);

/**
 * Object-property route data: `href: '/x'` / `to: '/x'` inside menu/tab/card
 * config objects. Only `href`/`to` keys (colon form) — NOT `path:` (used for
 * non-navigation values like cookie paths) — to avoid false positives.
 */
const OBJECT_PROP_PATTERN = new RegExp(
  `\\b(?:href|to):\\s*${ROUTE_LITERAL}`,
  'g',
);

/**
 * Route-root literals that intentionally remain — no exact `APP_ROUTES` constant
 * exists, or the value is pending a separate fix. Keep this list short and
 * documented; every entry is a deliberate exception, not a TODO to ignore.
 * Currently empty: the admin tab-strip debt it once held has been migrated.
 */
const ALLOWLISTED_ROUTE_VALUES = new Set<string>([]);

export type Violation = {
  file: string;
  line: number;
  path: string;
};

const ADMIN_SOURCE_PREFIX = 'apps/app/app/(protected)/admin/';
const ADMIN_ESCAPE_LITERAL = `(['"\`])(\\/(?!admin(?:[/?#]|$))[^'"\`\\n]*)\\1`;
const ADMIN_ESCAPE_PATTERNS = [
  new RegExp(`\\b(?:href|to)=\\{?\\s*${ADMIN_ESCAPE_LITERAL}`, 'g'),
  new RegExp(
    `(?:push|replace|redirect|assign)\\(\\s*${ADMIN_ESCAPE_LITERAL}`,
    'g',
  ),
  new RegExp(`\\b(?:href|to):\\s*${ADMIN_ESCAPE_LITERAL}`, 'g'),
  new RegExp(`\\bbasePath\\s*=\\s*${ADMIN_ESCAPE_LITERAL}`, 'g'),
  new RegExp(`\\bpathname\\s*(?:===|!==)\\s*${ADMIN_ESCAPE_LITERAL}`, 'g'),
];

function collectRouteValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.values(value).flatMap(collectRouteValues);
}

const CANONICAL_APP_ROUTE_VALUES = new Set(collectRouteValues(APP_ROUTES));
const CANONICAL_NON_ROOT_ROUTE_VALUES = [...CANONICAL_APP_ROUTE_VALUES].filter(
  (route) => route !== APP_ROUTES.ROOT,
);

function collect(
  content: string,
  pattern: RegExp,
  filePath: string,
  rootDir: string,
  violations: Violation[],
  shouldFlag: (routePath: string) => boolean = () => true,
): void {
  for (const match of content.matchAll(pattern)) {
    const routePath = match[2];
    if (
      !routePath ||
      ALLOWLISTED_ROUTE_VALUES.has(routePath) ||
      !shouldFlag(routePath)
    ) {
      continue;
    }
    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    violations.push({
      file: path.relative(rootDir, filePath),
      line,
      path: routePath,
    });
  }
}

function shouldFlagPlaywrightRoute(routePath: string): boolean {
  const pathname = routePath.split(/[?#]/, 1)[0] ?? routePath;
  return (
    CANONICAL_NON_ROOT_ROUTE_VALUES.some(
      (canonicalRoute) =>
        pathname === canonicalRoute ||
        pathname.startsWith(`${canonicalRoute}/`),
    ) ||
    pathname === LEGACY_APP_ROUTES.TASKS ||
    pathname.startsWith(`${LEGACY_APP_ROUTES.TASKS}/`)
  );
}

function findViolations(filePath: string, rootDir: string): Violation[] {
  const content = readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  collect(content, JSX_ATTR_PATTERN, filePath, rootDir, violations);
  collect(content, NAV_CALL_PATTERN, filePath, rootDir, violations);
  collect(content, OBJECT_PROP_PATTERN, filePath, rootDir, violations);

  const relativeFilePath = path
    .relative(rootDir, filePath)
    .replaceAll('\\', '/');
  if (relativeFilePath.startsWith(ADMIN_SOURCE_PREFIX)) {
    violations.push(
      ...findAdminRouteContainmentViolations(content, relativeFilePath),
    );
  }

  return violations;
}

export function findAdminRouteContainmentViolations(
  content: string,
  file: string,
): Violation[] {
  const violations: Violation[] = [];

  for (const pattern of ADMIN_ESCAPE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const routePath = match[2];
      if (!routePath) {
        continue;
      }

      const index = match.index ?? 0;
      violations.push({
        file,
        line: content.slice(0, index).split('\n').length,
        path: routePath,
      });
    }
  }

  return violations.sort(
    (left, right) =>
      left.line - right.line || left.path.localeCompare(right.path),
  );
}

function findPlaywrightViolations(
  filePath: string,
  rootDir: string,
): Violation[] {
  const content = readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  collect(
    content,
    PLAYWRIGHT_GOTO_PATTERN,
    filePath,
    rootDir,
    violations,
    shouldFlagPlaywrightRoute,
  );
  collect(
    content,
    PLAYWRIGHT_ROUTE_HELPER_PATTERN,
    filePath,
    rootDir,
    violations,
    shouldFlagPlaywrightRoute,
  );
  return violations;
}

export function runCheckHardcodedAppRoutes(): { violations: Violation[] } {
  const rootDir = process.cwd();
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });
  const playwrightFiles = globSync(PLAYWRIGHT_INCLUDE_GLOBS, {
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**'],
    nodir: true,
  });

  const allViolations: Violation[] = [];
  for (const filePath of files) {
    allViolations.push(...findViolations(filePath, rootDir));
  }
  for (const filePath of playwrightFiles) {
    allViolations.push(...findPlaywrightViolations(filePath, rootDir));
  }

  return { violations: allViolations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckHardcodedAppRoutes();

  if (violations.length > 0) {
    logger.error(
      'Hardcoded route-root literals found in navigation sinks. Use APP_ROUTES.*' +
        ' constants, or createBrandAppRoute / createOrganizationAppRoute for' +
        ' org/brand-scoped links (both from @genfeedai/contracts/constants). Playwright' +
        ' navigation calls must use the same route contract.',
    );
    for (const violation of violations) {
      logger.error(
        `- ${violation.file}:${violation.line} → '${violation.path}'`,
      );
    }
    process.exit(1);
  }

  logger.log('No hardcoded route-root literals found.');
}
