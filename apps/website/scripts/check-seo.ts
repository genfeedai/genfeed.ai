/**
 * Full-site SEO audit against a running build.
 *
 * Replaces a paid third-party site audit with a gate that runs on every PR:
 * crawl the site, evaluate the rules in ./seo/seo-rules.ts, and fail on errors
 * that are not in the baseline. Warnings are reported but never fail.
 *
 *   BASE_URL=http://localhost:3000 bun run check:seo
 *   SEO_JSON=report.json bun run check:seo     # machine-readable output
 *   SEO_UPDATE_BASELINE=1 bun run check:seo    # accept current errors
 *   SEO_SOFT=1 bun run check:seo               # report only, never exit 1
 *
 * seo/seo-baseline.json ships empty: the gate is advisory (SEO_SOFT=1 in CI)
 * until someone runs it against a real build and seeds the baseline. Once seeded,
 * drop SEO_SOFT from the workflow and the ratchet is live.
 *
 * Two things a self-crawl cannot see on its own, both handled here:
 *  - dynamic routes that answer 200 for slugs that do not exist (soft 404s).
 *    They are never linked, so no crawler reaches them; we probe them directly.
 *  - JSON-LD breadcrumb targets, which crawlers do not follow. We resolve them.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { crawlSite, fetchPath, fetchSitemapUniverse } from './seo/crawl';
import { parsePage } from './seo/page-parser';
import {
  auditPage,
  checkDuplicateDescriptions,
  checkDuplicateTitles,
  checkSitemapCoverage,
  checkSitemapEntriesResolve,
  collectBreadcrumbTargets,
  type Finding,
  type PageInput,
  summarize,
} from './seo/seo-rules';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const USER_AGENT = 'genfeed-seo-audit/1.0 (+https://genfeed.ai)';
const CONCURRENCY = 10;
const REQUEST_TIMEOUT_MS = 15_000;
const BASELINE_PATH = path.join(import.meta.dirname, 'seo/seo-baseline.json');

/** Exit 0 even on new errors — for the advisory rollout window. */
const SOFT_MODE = process.env.SEO_SOFT === '1';

/**
 * Dynamic route families whose "record not found" branch must answer 404.
 * The probe slug is deliberately absurd so it can never match real content.
 */
const NOT_FOUND_PROBE_PATHS = [
  '/articles/genfeed-seo-probe-does-not-exist',
  '/posts/genfeed-seo-probe-does-not-exist',
  '/vs/genfeed-seo-probe-does-not-exist',
  '/integrations/genfeed-seo-probe-does-not-exist',
  '/use-cases/genfeed-seo-probe-does-not-exist',
  '/u/genfeed-seo-probe-does-not-exist',
  '/genfeed-seo-probe-does-not-exist',
] as const;

interface Baseline {
  readonly accepted: string[];
}

function findingKey(item: Finding): string {
  return `${item.rule} ${item.path}`;
}

function readBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) {
    return new Set();
  }
  const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
  return new Set(parsed.accepted ?? []);
}

/** Probe dynamic routes directly — nothing links to a nonexistent slug. */
async function probeNotFoundRoutes(): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const probePath of NOT_FOUND_PROBE_PATHS) {
    let result: Awaited<ReturnType<typeof fetchPath>>;
    try {
      result = await fetchPath(probePath, {
        origin: BASE_URL,
        timeoutMs: REQUEST_TIMEOUT_MS,
        userAgent: USER_AGENT,
      });
    } catch {
      continue;
    }
    if (result.status === 200) {
      findings.push({
        detail:
          'Returned HTTP 200 for a slug that cannot exist. The route must call notFound() so search engines see a 404 instead of a soft 404.',
        path: probePath,
        rule: 'soft-404-route',
        severity: 'error',
      });
    }
  }
  return findings;
}

/** Resolve every BreadcrumbList target; crawlers never follow these. */
async function checkBreadcrumbTargets(
  inputs: readonly PageInput[],
  origin: string,
): Promise<Finding[]> {
  const sources = new Map<string, string>();
  for (const { facts, path: pagePath } of inputs) {
    for (const target of collectBreadcrumbTargets(facts)) {
      if (!sources.has(target)) {
        sources.set(target, pagePath);
      }
    }
  }

  const findings: Finding[] = [];
  for (const [target, sourcePath] of sources) {
    let targetPath: string;
    try {
      const url = new URL(target);
      if (url.origin !== origin) {
        continue;
      }
      targetPath = url.pathname;
    } catch {
      findings.push({
        detail: `Breadcrumb item "${target}" is not an absolute URL.`,
        path: sourcePath,
        rule: 'breadcrumb-target-invalid',
        severity: 'error',
      });
      continue;
    }

    try {
      const result = await fetchPath(targetPath, {
        origin: BASE_URL,
        timeoutMs: REQUEST_TIMEOUT_MS,
        userAgent: USER_AGENT,
      });
      if (result.status !== 200) {
        findings.push({
          detail: `Breadcrumb points at ${targetPath}, which returned HTTP ${result.status}.`,
          path: sourcePath,
          rule: 'breadcrumb-target-broken',
          severity: 'error',
        });
      }
    } catch {
      findings.push({
        detail: `Breadcrumb points at ${targetPath}, which could not be fetched.`,
        path: sourcePath,
        rule: 'breadcrumb-target-broken',
        severity: 'error',
      });
    }
  }
  return findings;
}

function report(findings: readonly Finding[], label: string): void {
  if (findings.length === 0) {
    return;
  }
  const byRule = new Map<string, Finding[]>();
  for (const item of findings) {
    byRule.set(item.rule, [...(byRule.get(item.rule) ?? []), item]);
  }
  console.error(`\n${label}`);
  for (const [rule, items] of [...byRule].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    console.error(`\n  ${rule} (${items.length})`);
    for (const item of items.slice(0, 25)) {
      console.error(`    ${item.path} — ${item.detail}`);
    }
    if (items.length > 25) {
      console.error(`    … and ${items.length - 25} more`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`SEO audit against ${BASE_URL}`);

  const { paths: sitemap, publicOrigin } = await fetchSitemapUniverse({
    origin: BASE_URL,
    userAgent: USER_AGENT,
  });
  console.log(
    `  sitemap: ${sitemap.size} URLs (public origin ${publicOrigin})`,
  );

  const { pages, reachable } = await crawlSite({
    concurrency: CONCURRENCY,
    origin: BASE_URL,
    seeds: ['/', ...sitemap],
    timeoutMs: REQUEST_TIMEOUT_MS,
    userAgent: USER_AGENT,
  });

  const htmlPages = [...pages.values()].filter(
    (page) => page.isHtml && page.html !== null,
  );
  console.log(`  crawled: ${pages.size} URLs (${htmlPages.length} HTML)`);

  const inputs: PageInput[] = htmlPages.map((page) => ({
    expectedCanonical: `${publicOrigin}${page.path}`,
    facts: parsePage(page.html ?? ''),
    path: page.path,
  }));

  const findings: Finding[] = [
    ...inputs.flatMap((pageInput) => auditPage(pageInput)),
    ...checkDuplicateTitles(inputs),
    ...checkDuplicateDescriptions(inputs),
    ...checkSitemapCoverage(inputs, sitemap),
    ...checkSitemapEntriesResolve(sitemap, reachable),
    ...(await probeNotFoundRoutes()),
    ...(await checkBreadcrumbTargets(inputs, publicOrigin)),
  ];

  const { byRule, errors, warnings } = summarize(findings);
  console.log(`\nFindings: ${errors} errors, ${warnings} warnings`);
  for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${rule}`);
  }

  const jsonPath = process.env.SEO_JSON;
  if (jsonPath) {
    writeFileSync(
      jsonPath,
      `${JSON.stringify({ baseUrl: BASE_URL, findings, pages: htmlPages.length }, null, 2)}\n`,
    );
    console.log(`\nWrote ${jsonPath}`);
  }

  const errorFindings = findings.filter((f) => f.severity === 'error');

  if (process.env.SEO_UPDATE_BASELINE === '1') {
    const accepted = [...new Set(errorFindings.map(findingKey))].sort();
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ accepted }, null, 2)}\n`);
    console.log(`\nBaseline updated with ${accepted.length} accepted errors.`);
    return;
  }

  const baseline = readBaseline();
  const regressions = errorFindings.filter(
    (item) => !baseline.has(findingKey(item)),
  );
  const stale = [...baseline].filter(
    (key) => !errorFindings.some((item) => findingKey(item) === key),
  );

  report(
    findings.filter((f) => f.severity === 'warning'),
    'Warnings',
  );

  if (stale.length > 0) {
    console.log(
      `\n${stale.length} baseline entries are now fixed — drop them from seo-baseline.json:`,
    );
    for (const key of stale.slice(0, 25)) {
      console.log(`  ${key}`);
    }
  }

  if (regressions.length === 0) {
    console.log(
      `\nNo new SEO errors (${baseline.size - stale.length} still accepted by the baseline).`,
    );
    return;
  }

  report(regressions, `${regressions.length} NEW SEO errors`);
  console.error(
    '\nFix these, or accept them deliberately with SEO_UPDATE_BASELINE=1.',
  );
  if (SOFT_MODE) {
    console.log('SEO_SOFT=1 — not failing the run.');
    return;
  }
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
