/**
 * Admin route convention guard (#8564).
 *
 * The admin app mirrors the product app: a flat list at `/admin/<things>` and
 * a detail at `/admin/<things>/:id`. Two things quietly break that and still
 * compile, so this guard fails on them:
 *
 * 1. A detail page with no list. `.../[id]/page.tsx` (or `[fooId]`) needs a
 *    `page.tsx` in its parent directory, otherwise the detail has no list to
 *    come back to and the entity is only reachable by a hand-typed id.
 * 2. An id in the query string. `APP_ROUTES.ADMIN` constants must not carry
 *    `?id=`; the id is a path segment. Filters (`?organization=`, `?status=`)
 *    are query params and stay allowed.
 *
 * The route map lives in docs/admin-routes.md.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const ADMIN_PAGES_DIR = 'apps/web/app/(protected)/admin';
const ROUTES_FILE = 'packages/contracts/src/constants/routes.constant.ts';

const ID_SEGMENT_PATTERN = /^\[(?:id|[A-Za-z]+Id)\]$/u;
const ADMIN_ROUTE_QUERY_ID_PATTERN = /'\/admin[^']*[?&]id=[^']*'/gu;

export type AdminRouteConventionViolation =
  | { kind: 'detail-without-list'; page: string; expectedList: string }
  | { kind: 'query-id-route'; file: string; line: number; match: string };

export type AdminRouteConventionOptions = {
  rootDir?: string;
};

/** `a/(group)/[id]/page.tsx` serves `a/[id]`: route groups are not URL segments. */
function routeOf(page: string): string[] {
  return page
    .replaceAll('\\', '/')
    .split('/')
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/u.test(segment));
}

function checkDetailPages(rootDir: string): AdminRouteConventionViolation[] {
  const pages = globSync('**/page.tsx', {
    cwd: path.join(rootDir, ADMIN_PAGES_DIR),
    nodir: true,
  }).sort((left, right) => left.localeCompare(right));
  const routes = new Set(pages.map((page) => routeOf(page).join('/')));

  return pages.flatMap((page) => {
    const route = routeOf(page);
    const last = route.at(-1);
    if (!last || !ID_SEGMENT_PATTERN.test(last)) {
      return [];
    }

    const listRoute = route.slice(0, -1).join('/');
    if (routes.has(listRoute)) {
      return [];
    }

    return [
      {
        expectedList: `${ADMIN_PAGES_DIR}/${listRoute ? `${listRoute}/` : ''}page.tsx`,
        kind: 'detail-without-list' as const,
        page: `${ADMIN_PAGES_DIR}/${page.replaceAll('\\', '/')}`,
      },
    ];
  });
}

function checkQueryIdRoutes(rootDir: string): AdminRouteConventionViolation[] {
  const source = readFileSync(path.join(rootDir, ROUTES_FILE), 'utf8');

  return [...source.matchAll(ADMIN_ROUTE_QUERY_ID_PATTERN)].map((match) => ({
    file: ROUTES_FILE,
    kind: 'query-id-route' as const,
    line: source.slice(0, match.index).split('\n').length,
    match: match[0],
  }));
}

export function checkAdminRouteConvention(
  options: AdminRouteConventionOptions = {},
): AdminRouteConventionViolation[] {
  const rootDir = options.rootDir ?? process.cwd();

  return [...checkDetailPages(rootDir), ...checkQueryIdRoutes(rootDir)];
}

if (import.meta.main) {
  const violations = checkAdminRouteConvention();

  if (violations.length > 0) {
    console.error(
      'Admin route convention violations (see docs/admin-routes.md):\n' +
        violations
          .map((violation) =>
            violation.kind === 'detail-without-list'
              ? `- ${violation.page}: detail page has no list page at ${violation.expectedList}`
              : `- ${violation.file}:${violation.line}: id in the query string ${violation.match}; the id is a path segment`,
          )
          .join('\n'),
    );
    process.exit(1);
  }

  console.log('Admin route convention passed.');
}
