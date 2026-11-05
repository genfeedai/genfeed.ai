#!/usr/bin/env node
/**
 * Static route reference inventory. This scans source text, including page objects
 * and excluded specs; it does not establish navigation, execution, or QA coverage.
 * Browser pass/fail evidence belongs to the executed Playwright lanes.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROUTE_GROUP_SEGMENT_PATTERN = /^\(.+\)$/;
const DYNAMIC_SEGMENT_PATTERN = /^\[.+\]$/;
const TRAILING_SLASHES_PATTERN = /\/+$/;
const WILDCARD_ORG_BRAND_PREFIX_PATTERN = /^\/\*\/\*(?=\/|$)/;
const WILDCARD_ORG_TILDE_PREFIX_PATTERN = /^\/\*\/~(?=\/|$)/;
const TEST_ORG_BRAND_PREFIX_PATTERN = /^\/test-org\/brand-1(?=\/|$)/;
const TEST_ORG_TILDE_PREFIX_PATTERN = /^\/test-org\/~(?=\/|$)/;
const TEST_ORG_PREFIX_PATTERN = /^\/test-org(?=\/|$)/;
const WILDCARD_PREFIX_PATTERN = /^\/\*(?=\/|$)/;
const TEMPLATE_PLACEHOLDER_PATTERN = /^\$\{.+\}$/;
const ROUTE_PARAM_PATTERN = /^:[a-z]/i;
const ID_LIKE_SEGMENT_PATTERN = /^[0-9a-f-]{8,}$/i;
const DIGITS_ONLY_PATTERN = /^\d+$/;
const SPEC_OR_PAGE_FILE_PATTERN = /\.(spec|page)\.ts$/;
const LINE_BREAK_PATTERN = /\r?\n/;
const APP_ROUTES_START_PATTERN = /^export const APP_ROUTES = \{$/;
const ROUTE_STRING_LINE_PATTERN = /^\s*(['"`])(\/[^'"`]*)\1,?\s*$/;
const ROUTE_GROUP_START_PATTERN = /^\s*([A-Z][A-Z0-9_]*):\s*\{$/;
const ROUTE_ENTRY_LINE_PATTERN =
  /^\s*([A-Z][A-Z0-9_]*):\s*(['"`])(\/[^'"`]*)\2,\s*$/;
const ROUTE_KEY_LINE_PATTERN = /^\s*([A-Z][A-Z0-9_]*):\s*$/;
const BLOCK_END_LINE_PATTERN = /^\s*},?\s*$/;
const ROUTE_SUFFIX_CONCAT_PATTERN = /^\s*\+\s*['"`](\/[^'"`]*)['"`]/;
const ROUTE_TEMPLATE_SUFFIX_PATTERN = /^\}(\/[\w\-/*]*)/;
const TEMPLATE_IDENTIFIERS_PATTERN = /\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appRoot = path.join(repoRoot, 'apps/web/app');
const appRoutesFile = path.join(
  repoRoot,
  'packages/contracts/src/constants/routes.constant.ts',
);
const e2eRoots = [
  path.join(repoRoot, 'playwright/e2e/tests'),
  path.join(repoRoot, 'playwright/e2e/pages'),
];

/** @param {string} dir @returns {string[]} */
function listPageFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPageFiles(entryPath);
    return entry.isFile() && entry.name === 'page.tsx' ? [entryPath] : [];
  });
}

/**
 * Convert a page.tsx path into a canonical route key:
 * - route groups `(x)` are dropped
 * - dynamic segments `[x]` / `[...x]` become `*`
 * - the org/brand/personal prefix is stripped so specs that navigate with bare
 *   paths (e.g. `/overview`) line up with the real `/[orgSlug]/[brandSlug]/...`
 * @param {string} filePath
 * @returns {string}
 */
function pageFileToKey(filePath) {
  const relative = path.relative(appRoot, path.dirname(filePath));
  const segments =
    relative === ''
      ? []
      : relative
          .split(path.sep)
          .filter((segment) => !ROUTE_GROUP_SEGMENT_PATTERN.test(segment))
          .map((segment) =>
            DYNAMIC_SEGMENT_PATTERN.test(segment) ? '*' : segment,
          );

  return canonicalize(`/${segments.join('/')}`);
}

/**
 * Normalise a path into a comparable key: collapse the tenant prefix and turn
 * concrete dynamic values into `*`.
 * @param {string} routePath
 * @returns {string}
 */
export function canonicalize(routePath) {
  let p = routePath.split('?')[0].split('#')[0];
  p = p.replace(TRAILING_SLASHES_PATTERN, '') || '/';

  // Strip the dynamic tenant prefix in all its forms.
  p = p
    .replace(WILDCARD_ORG_BRAND_PREFIX_PATTERN, '') // /[orgSlug]/[brandSlug]
    .replace(WILDCARD_ORG_TILDE_PREFIX_PATTERN, '') // /[orgSlug]/~
    .replace(TEST_ORG_BRAND_PREFIX_PATTERN, '')
    .replace(TEST_ORG_TILDE_PREFIX_PATTERN, '')
    .replace(TEST_ORG_PREFIX_PATTERN, '')
    .replace(WILDCARD_PREFIX_PATTERN, ''); // bare /[orgSlug]

  // Replace concrete dynamic-looking segments with `*`. Includes the mock ids
  // and the platform/type enum values specs use for `[platform]` / `[type]`
  // dynamic segments, so literal navigations line up with discovered routes.
  const mockIds = new Set([
    'brand-1',
    'mock-id',
    'agent-1',
    'run-1',
    'thread-1',
    'job-1',
    'company-1',
    'test-project-id',
    'task-201',
    'gen-101',
    // [platform]
    'tiktok',
    'instagram',
    'youtube',
    'twitter',
    'linkedin',
    'threads',
    'facebook',
    'reddit',
    'pinterest',
    'bluesky',
    // [type] enum values
    'image',
    'video',
    'music',
    'avatar',
    'voice',
    'caption',
    'gif',
  ]);
  p = p
    .split('/')
    .map((seg) => {
      if (seg === '') return seg;
      if (TEMPLATE_PLACEHOLDER_PATTERN.test(seg)) return '*'; // template literal `${id}`
      if (ROUTE_PARAM_PATTERN.test(seg)) return '*'; // :id style
      if (DYNAMIC_SEGMENT_PATTERN.test(seg)) return '*';
      if (mockIds.has(seg.toLowerCase())) return '*';
      if (ID_LIKE_SEGMENT_PATTERN.test(seg)) return '*'; // uuid/hash-ish
      if (DIGITS_ONLY_PATTERN.test(seg)) return '*'; // numeric id
      return seg;
    })
    .join('/');

  return p.replace(TRAILING_SLASHES_PATTERN, '') || '/';
}

// ---------------------------------------------------------------------------
// Spec navigation extraction
// ---------------------------------------------------------------------------

/** @param {string} dir @returns {string[]} */
function listFilesRecursive(dir) {
  let out = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out = out.concat(listFilesRecursive(full));
      else if (
        SPEC_OR_PAGE_FILE_PATTERN.test(entry.name) ||
        entry.name.endsWith('.page.ts')
      ) {
        out.push(full);
      }
    }
  } catch {
    /* dir may not exist */
  }
  return out;
}

const ALL_APP_PAGES_FILE = 'all-app-pages.spec.ts';

// Any quoted/backtick string literal.
const STRING_LITERAL_RE = /[`'"]([^`'"\n]+)[`'"]/g;
// `const NAME = '/literal'` path constants used to build template routes.
const PATH_CONST_RE =
  /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*['"`](\/[^'"`\n]*)['"`]/g;
const APP_ROUTE_REFERENCE_RE = /\bAPP_ROUTES(?:\.[A-Z][A-Z0-9_]*)+/g;
// A candidate route after substitution: starts with `/`, only route-ish chars.
const ROUTE_SHAPE_RE = /^\/[\w\-~/*]*$/;

/**
 * Read the shared APP_ROUTES object without importing TypeScript into this
 * dependency-free Node script.
 * Supports single-line and multiline value forms:
 *   KEY: '/path',
 *   KEY:
 *     '/path',
 * @param {string} [source] optional source text (tests)
 * @returns {Map<string, string>}
 */
export function readAppRouteConstants(source) {
  const routes = new Map();
  const stack = [];
  let insideAppRoutes = false;
  /** @type {string | null} */
  let pendingKey = null;
  const text = source ?? readFileSync(appRoutesFile, 'utf8');

  for (const line of text.split(LINE_BREAK_PATTERN)) {
    if (!insideAppRoutes) {
      insideAppRoutes = APP_ROUTES_START_PATTERN.test(line);
      continue;
    }

    if (pendingKey) {
      const multilineValue = line.match(ROUTE_STRING_LINE_PATTERN);
      if (multilineValue) {
        routes.set(
          ['APP_ROUTES', ...stack, pendingKey].join('.'),
          multilineValue[2],
        );
        pendingKey = null;
        continue;
      }
      // Fall through if the next line is not a bare path value.
      pendingKey = null;
    }

    const group = line.match(ROUTE_GROUP_START_PATTERN);
    if (group) {
      stack.push(group[1]);
      continue;
    }

    const route = line.match(ROUTE_ENTRY_LINE_PATTERN);
    if (route) {
      routes.set(['APP_ROUTES', ...stack, route[1]].join('.'), route[3]);
      continue;
    }

    // Multiline key with value on the following line (ELEMENTS_CAMERA_MOVEMENTS).
    const bareKey = line.match(ROUTE_KEY_LINE_PATTERN);
    if (bareKey) {
      pendingKey = bareKey[1];
      continue;
    }

    if (BLOCK_END_LINE_PATTERN.test(line)) {
      if (stack.length === 0) break;
      stack.pop();
    }
  }

  return routes;
}

/**
 * Resolve an APP_ROUTES reference plus any immediate path suffix
 * (`APP_ROUTES.X + '/mock-id'` or `${APP_ROUTES.X}/mock-id`).
 * @param {string} src
 * @param {number} matchIndex
 * @param {number} matchLength
 * @returns {string}
 */
export function readAppRouteSuffix(src, matchIndex, matchLength) {
  const after = src.slice(
    matchIndex + matchLength,
    matchIndex + matchLength + 48,
  );
  const concat = after.match(ROUTE_SUFFIX_CONCAT_PATTERN);
  if (concat) {
    return concat[1];
  }
  // Template: `${APP_ROUTES.FOO}/mock-id` — after the closing `}` of ${...}
  const templateTail = after.match(ROUTE_TEMPLATE_SUFFIX_PATTERN);
  if (templateTail) {
    return templateTail[1];
  }
  return '';
}

/**
 * Resolve `${CONST}` references inside a template-literal route using the
 * per-file path constant map; unknown references remain unresolved (and are not credited).
 * @param {string} raw @param {Record<string,string>} consts
 */
function resolveTemplate(raw, consts) {
  return raw.replace(TEMPLATE_IDENTIFIERS_PATTERN, (match, name) =>
    Object.hasOwn(consts, name) ? consts[name] : match,
  );
}

/**
 * @returns {Set<string>} canonical route keys referenced in source text.
 *
 * Routes are reached both via direct `.goto()` calls and via helpers like
 * `assertRouteRenders(page, route)` where `route` comes from a `routes = [...]`
 * array. So we scan every string/template literal in the file, resolve path
 * constants (`const BRAND = '/test-org/brand-1'`), keep the ones shaped like an
 * app route, and canonicalize them. Non-route strings (selectors, api urls,
 * regexes) are filtered out by ROUTE_SHAPE_RE.
 */
export function extractRouteReferenceKeys(src, appRoutes = new Map()) {
  const keys = new Set();
  /** @type {Record<string, string>} */
  const consts = {};
  for (const match of src.matchAll(PATH_CONST_RE)) consts[match[1]] = match[2];
  for (const match of src.matchAll(APP_ROUTE_REFERENCE_RE)) {
    const route = appRoutes.get(match[0]);
    if (!route) continue;
    const suffix = readAppRouteSuffix(src, match.index ?? 0, match[0].length);
    keys.add(canonicalize(`${route}${suffix}`));
  }
  for (const match of src.matchAll(STRING_LITERAL_RE)) {
    const resolved = resolveTemplate(match[1], consts);
    if (!resolved.startsWith('/') || resolved.startsWith('//')) continue;
    if (resolved.startsWith('/v1') || resolved.startsWith('/api')) continue;
    const key = canonicalize(resolved);
    if (!ROUTE_SHAPE_RE.test(key)) continue;
    keys.add(key);
  }
  return keys;
}

function collectNavigatedKeys() {
  const keys = new Set();
  const files = e2eRoots.flatMap((root) => listFilesRecursive(root));
  const appRoutes = readAppRouteConstants();
  for (const file of files) {
    // The generated route sweep provides no static interaction evidence.
    if (file.endsWith(ALL_APP_PAGES_FILE)) continue;
    for (const key of extractRouteReferenceKeys(
      readFileSync(file, 'utf8'),
      appRoutes,
    ))
      keys.add(key);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildRouteReferenceInventory(discovered, references) {
  if (discovered.length === 0) throw new Error('No app routes discovered');
  const referencedRoutes = discovered.filter((route) => references.has(route));
  return {
    kind: 'static-reference-inventory',
    discoveredRouteCount: discovered.length,
    referencedRoutes,
    unreferencedRoutes: discovered.filter((route) => !references.has(route)),
    referencePercent: pct(referencedRoutes.length, discovered.length),
    executedRouteCount: null,
  };
}

function main() {
  if (!safeExists(appRoot)) {
    console.error(`App root not found: ${appRoot}`);
    process.exit(1);
  }
  if (
    process.env.E2E_ROUTE_COVERAGE_MODE ||
    process.env.E2E_ROUTE_COVERAGE_THRESHOLD
  ) {
    throw new Error(
      'Static route inventory cannot gate execution coverage. Remove E2E_ROUTE_COVERAGE_MODE/THRESHOLD; use the executed browser gates.',
    );
  }

  const discovered = [
    ...new Set(listPageFiles(appRoot).map(pageFileToKey)),
  ].sort();
  const report = buildRouteReferenceInventory(
    discovered,
    collectNavigatedKeys(),
  );
  console.log('=== Static E2E route reference inventory ===');
  console.log(`Discovered canonical routes: ${report.discoveredRouteCount}`);
  console.log(
    `Exact source references: ${report.referencedRoutes.length} (${report.referencePercent.toFixed(1)}%)`,
  );
  console.log('Execution coverage: unavailable from source text.');
  console.log(
    'References include page objects and excluded specs; they do not prove a test ran or passed.',
  );
  console.log(
    'Reporting only. Release confidence comes from the executed browser gates.',
  );
  if (report.unreferencedRoutes.length > 0) {
    console.log('Routes without exact source references:');
    for (const route of report.unreferencedRoutes) console.log(`  - ${route}`);
  }
}

/** @param {number} n @param {number} d */
function pct(n, d) {
  return d === 0 ? 0 : (n / d) * 100;
}

/** @param {string} p */
function safeExists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) ===
    path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
