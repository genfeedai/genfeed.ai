/**
 * Guard: bare string-literal router.push/replace calls inside the org-scoped
 * route tree (app/(protected)/[orgSlug]) must compose paths through
 * useOrgUrl href() or orgHref() rather than passing raw absolute paths.
 *
 * Allowlisted paths are root-level navigations that intentionally bypass org
 * scoping (e.g. /onboarding, /auth, or paths that are unreachable inside the
 * org tree but present in shared code).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const logger = {
  error: (message: string) =>
    console.error(`[CheckOrgScopedNavigation] ${message}`),
  log: (message: string) =>
    console.log(`[CheckOrgScopedNavigation] ${message}`),
};

const INCLUDE_GLOB = 'apps/app/app/(protected)/[orgSlug]/**/*.{ts,tsx}';

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
];

/**
 * Root-level paths that legitimately navigate outside the org/brand tree.
 * Extend this list when a new intentional root navigation is added.
 */
const ALLOWLISTED_ROOT_PATHS = new Set([
  '/onboarding',
  '/auth',
  '/sign-in',
  '/sign-up',
  '/login',
]);

/**
 * Matches bare string-literal arguments to router.push() or router.replace()
 * that start with '/' but are not composed through a variable.
 *
 * Examples that should be flagged:
 *   push('/orchestration')
 *   replace('/studio')
 *   push('/chat/new?prompt=...')
 *
 * Examples that should NOT be flagged:
 *   push(href('/orchestration'))
 *   replace(orgHref('/chat/new'))
 *   push(someVar)
 */
const BARE_NAV_PATTERN = /(?:push|replace)\(\s*(['"`])(\/.+?)\1\s*(?:,|\))/g;

type Violation = {
  file: string;
  line: number;
  path: string;
};

function isAllowlisted(navPath: string): boolean {
  // Strip query string / hash for comparison
  const bare = navPath.split('?')[0].split('#')[0];
  return ALLOWLISTED_ROOT_PATHS.has(bare);
}

function findViolations(filePath: string, rootDir: string): Violation[] {
  const content = readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];

  for (const match of content.matchAll(BARE_NAV_PATTERN)) {
    const navPath = match[2];
    if (!navPath || isAllowlisted(navPath)) {
      continue;
    }
    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    violations.push({
      file: path.relative(rootDir, filePath),
      line,
      path: navPath,
    });
  }

  return violations;
}

export function runCheckOrgScopedNavigation(): { violations: Violation[] } {
  const rootDir = process.cwd();
  const files = globSync(INCLUDE_GLOB, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

  const allViolations: Violation[] = [];

  for (const filePath of files) {
    allViolations.push(...findViolations(filePath, rootDir));
  }

  return { violations: allViolations };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckOrgScopedNavigation();

  if (violations.length > 0) {
    logger.error(
      'Bare router.push/replace calls found inside org-scoped routes.' +
        ' Compose paths through useOrgUrl href() or orgHref() instead.',
    );
    for (const violation of violations) {
      logger.error(
        `- ${violation.file}:${violation.line} → push/replace('${violation.path}')`,
      );
    }
    process.exit(1);
  }

  logger.log('No bare org-scoped navigation violations found.');
}
