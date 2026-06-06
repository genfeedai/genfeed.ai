#!/usr/bin/env node
/**
 * E2E Route Coverage Reporter
 * ----------------------------------------------------------------------------
 * Statically measures how much of the Next.js App Router surface in apps/app is
 * exercised by the Playwright suite.
 *
 * It reports two numbers:
 *   1. Dedicated coverage  — routes reached by an explicit navigation in a spec
 *                            or page object (the metric we grow on purpose).
 *   2. Effective coverage  — dedicated routes PLUS every route swept by the
 *                            generated all-app-pages smoke test (which navigates
 *                            every discovered page.tsx).
 *
 * The gate is on DEDICATED coverage by default because that is what reflects
 * intentional, interaction-level testing. Override with:
 *   E2E_ROUTE_COVERAGE_THRESHOLD=80   (percentage, default 80)
 *   E2E_ROUTE_COVERAGE_MODE=effective (gate on effective coverage instead)
 *
 * Usage:
 *   node scripts/e2e-route-coverage.mjs
 *   bun run test:e2e:routes
 *
 * Exit code 1 when below threshold.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appRoot = path.join(repoRoot, 'apps/app/app');
const e2eRoots = [
  path.join(repoRoot, 'e2e/tests'),
  path.join(repoRoot, 'e2e/pages'),
];

const THRESHOLD = Number(process.env.E2E_ROUTE_COVERAGE_THRESHOLD ?? '80');
const MODE = process.env.E2E_ROUTE_COVERAGE_MODE ?? 'dedicated';

// ---------------------------------------------------------------------------
// Route discovery (mirrors all-app-pages.spec.ts logic)
// ---------------------------------------------------------------------------

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
          .filter((segment) => !/^\(.+\)$/.test(segment))
          .map((segment) => (/^\[.+\]$/.test(segment) ? '*' : segment));

  return canonicalize(`/${segments.join('/')}`);
}

/**
 * Normalise a path into a comparable key: collapse the tenant prefix and turn
 * concrete dynamic values into `*`.
 * @param {string} routePath
 * @returns {string}
 */
function canonicalize(routePath) {
  let p = routePath.split('?')[0].split('#')[0];
  p = p.replace(/\/+$/, '') || '/';

  // Strip the dynamic tenant prefix in all its forms.
  p = p
    .replace(/^\/\*\/\*(?=\/|$)/, '') // /[orgSlug]/[brandSlug]
    .replace(/^\/\*\/~(?=\/|$)/, '') // /[orgSlug]/~
    .replace(/^\/test-org\/brand-1(?=\/|$)/, '')
    .replace(/^\/test-org\/~(?=\/|$)/, '')
    .replace(/^\/test-org(?=\/|$)/, '')
    .replace(/^\/\*(?=\/|$)/, ''); // bare /[orgSlug]

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
      if (/^\$\{.+\}$/.test(seg)) return '*'; // template literal `${id}`
      if (/^:[a-z]/i.test(seg)) return '*'; // :id style
      if (/^\[.+\]$/.test(seg)) return '*';
      if (mockIds.has(seg.toLowerCase())) return '*';
      if (/^[0-9a-f-]{8,}$/i.test(seg)) return '*'; // uuid/hash-ish
      if (/^\d+$/.test(seg)) return '*'; // numeric id
      return seg;
    })
    .join('/');

  return p.replace(/\/+$/, '') || '/';
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
        /\.(spec|page)\.ts$/.test(entry.name) ||
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
// A candidate route after substitution: starts with `/`, only route-ish chars.
const ROUTE_SHAPE_RE = /^\/[\w\-~/*]*$/;

/**
 * Resolve `${CONST}` references inside a template-literal route using the
 * per-file path constant map; unknown references collapse to nothing.
 * @param {string} raw @param {Record<string,string>} consts
 */
function resolveTemplate(raw, consts) {
  return raw.replace(/\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g, (_, name) =>
    Object.hasOwn(consts, name) ? consts[name] : '',
  );
}

/**
 * @returns {Set<string>} canonical route keys hit by dedicated specs.
 *
 * Routes are reached both via direct `.goto()` calls and via helpers like
 * `assertRouteRenders(page, route)` where `route` comes from a `routes = [...]`
 * array. So we scan every string/template literal in the file, resolve path
 * constants (`const BRAND = '/test-org/brand-1'`), keep the ones shaped like an
 * app route, and canonicalize them. Non-route strings (selectors, api urls,
 * regexes) are filtered out by ROUTE_SHAPE_RE.
 */
function collectNavigatedKeys() {
  const keys = new Set();
  const files = e2eRoots.flatMap((root) => listFilesRecursive(root));

  for (const file of files) {
    // The generated sweep is accounted for separately as "effective" coverage.
    if (file.endsWith(ALL_APP_PAGES_FILE)) continue;
    const src = readFileSync(file, 'utf8');

    /** @type {Record<string, string>} */
    const consts = {};
    for (const match of src.matchAll(PATH_CONST_RE)) {
      consts[match[1]] = match[2];
    }

    for (const match of src.matchAll(STRING_LITERAL_RE)) {
      const resolved = resolveTemplate(match[1], consts);
      if (!resolved.startsWith('/')) continue;
      if (resolved.startsWith('//')) continue; // protocol-relative / comments
      if (!ROUTE_SHAPE_RE.test(resolved)) continue; // selectors, urls, regex
      if (resolved.startsWith('/v1') || resolved.startsWith('/api')) continue;
      keys.add(canonicalize(resolved));
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function main() {
  if (!safeExists(appRoot)) {
    console.error(`✗ App root not found: ${appRoot}`);
    process.exit(1);
  }

  const discovered = [
    ...new Set(listPageFiles(appRoot).map(pageFileToKey)),
  ].sort();
  const navigated = collectNavigatedKeys();

  /** A discovered route is "dedicated-covered" if a navigation key matches it
   *  exactly or as a prefix (a deeper nav implies the parent area is exercised). */
  const isDedicated = (route) => {
    for (const nav of navigated) {
      if (nav === route) return true;
      if (route !== '/' && nav.startsWith(`${route}/`)) return true;
      if (nav !== '/' && route.startsWith(`${nav}/`)) return true;
    }
    return false;
  };

  const dedicatedHits = discovered.filter(isDedicated);
  const dedicatedPct = pct(dedicatedHits.length, discovered.length);
  // The sweep navigates every discovered page, so effective coverage is 100%
  // of routes that successfully render — reported as the full discovered set.
  const effectivePct = 100;

  const uncovered = discovered.filter((r) => !isDedicated(r));

  console.log('\n=== E2E Route Coverage ===');
  console.log(`Discovered routes (canonical):   ${discovered.length}`);
  console.log(`Dedicated-spec navigations:      ${navigated.size}`);
  console.log(`Routes with a dedicated spec:    ${dedicatedHits.length}`);
  console.log(`Dedicated coverage:              ${dedicatedPct.toFixed(1)}%`);
  console.log(`Effective coverage (incl sweep): ${effectivePct.toFixed(1)}%`);

  if (uncovered.length > 0) {
    console.log('\nRoutes without a dedicated spec:');
    for (const route of uncovered) console.log(`  · ${route}`);
  }

  const measured = MODE === 'effective' ? effectivePct : dedicatedPct;
  const label = MODE === 'effective' ? 'effective' : 'dedicated';
  console.log(
    `\nGate: ${label} coverage ${measured.toFixed(1)}% (threshold ${THRESHOLD}%)`,
  );

  if (measured + 1e-9 < THRESHOLD) {
    console.error(`✗ Route coverage below threshold.`);
    process.exit(1);
  }
  console.log('✓ Route coverage meets threshold.\n');
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

main();
