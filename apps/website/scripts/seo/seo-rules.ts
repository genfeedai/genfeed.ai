/**
 * Pure SEO rules evaluated against parsed page facts.
 *
 * Rule coverage mirrors the defect classes a third-party site audit reported for
 * genfeed.ai on 2026-08-05, so a regression in any of them fails CI instead of
 * waiting for the next external crawl:
 *
 * - soft 404 — `/articles/<any-slug>` answered 200 with not-found content
 * - duplicate H1 — 14 pages rendered the same heading twice
 * - canonical missing — every docs page shipped without one
 * - description duplicated across pages / too short / too long
 * - title too short (no descriptive text beyond the brand suffix) or too long
 * - structured data that cannot produce a rich result
 * - breadcrumb JSON-LD pointing at URLs that do not resolve
 */

import type { PageFacts } from './page-parser';

export const TITLE_MIN_LENGTH = 30;
export const TITLE_MAX_LENGTH = 60;
export const DESCRIPTION_MIN_LENGTH = 110;
export const DESCRIPTION_MAX_LENGTH = 160;
export const MIN_WORD_COUNT = 200;

export type Severity = 'error' | 'warning';

export interface Finding {
  readonly rule: string;
  readonly severity: Severity;
  readonly path: string;
  readonly detail: string;
}

export interface PageInput {
  readonly path: string;
  readonly facts: PageFacts;
  /** Absolute URL the canonical tag is expected to hold. */
  readonly expectedCanonical: string;
}

function finding(
  rule: string,
  severity: Severity,
  path: string,
  detail: string,
): Finding {
  return { detail, path, rule, severity };
}

/** Titles/descriptions that mean "this page does not exist". */
const NOT_FOUND_PATTERNS = [
  /\bnot found\b/i,
  /\bdoes not exist\b/i,
  /\bpage you are looking for\b/i,
  /^404\b/,
];

function looksNotFound(text: string | null): boolean {
  return text !== null && NOT_FOUND_PATTERNS.some((p) => p.test(text));
}

/**
 * A 200 response that renders not-found content. Google treats these as soft
 * 404s and they consume crawl budget on URLs that should never be indexed.
 */
export function checkSoftNotFound(input: PageInput): Finding[] {
  const { facts, path } = input;
  const signals: string[] = [];

  if (looksNotFound(facts.title)) {
    signals.push(`title "${facts.title}"`);
  }
  if (looksNotFound(facts.description)) {
    signals.push('description says not-found');
  }
  if (facts.h1s.some((h1) => looksNotFound(h1))) {
    signals.push('h1 says not-found');
  }

  if (signals.length === 0) {
    return [];
  }
  return [
    finding(
      'soft-404',
      'error',
      path,
      `HTTP 200 but renders not-found content (${signals.join(', ')}). Call notFound() so the route answers 404.`,
    ),
  ];
}

export function checkTitle(input: PageInput): Finding[] {
  const { facts, path } = input;
  if (facts.title === null || facts.title === '') {
    return [finding('title-missing', 'error', path, 'No <title>.')];
  }
  const length = facts.title.length;
  if (length < TITLE_MIN_LENGTH) {
    return [
      finding(
        'title-short',
        'warning',
        path,
        `${length} chars (min ${TITLE_MIN_LENGTH}): "${facts.title}"`,
      ),
    ];
  }
  if (length > TITLE_MAX_LENGTH) {
    return [
      finding(
        'title-long',
        'warning',
        path,
        `${length} chars (max ${TITLE_MAX_LENGTH}): "${facts.title}"`,
      ),
    ];
  }
  return [];
}

export function checkDescription(input: PageInput): Finding[] {
  const { facts, path } = input;
  if (facts.description === null || facts.description === '') {
    return [
      finding('description-missing', 'error', path, 'No meta description.'),
    ];
  }
  const length = facts.description.length;
  if (length < DESCRIPTION_MIN_LENGTH) {
    return [
      finding(
        'description-short',
        'warning',
        path,
        `${length} chars (min ${DESCRIPTION_MIN_LENGTH}).`,
      ),
    ];
  }
  if (length > DESCRIPTION_MAX_LENGTH) {
    return [
      finding(
        'description-long',
        'warning',
        path,
        `${length} chars (max ${DESCRIPTION_MAX_LENGTH}) — truncated in results.`,
      ),
    ];
  }
  return [];
}

export function checkHeadings(input: PageInput): Finding[] {
  const { facts, path } = input;
  if (facts.h1s.length === 0) {
    return [finding('h1-missing', 'error', path, 'No <h1> on the page.')];
  }
  if (facts.h1s.length > 1) {
    return [
      finding(
        'h1-multiple',
        'error',
        path,
        `${facts.h1s.length} <h1> elements: ${facts.h1s.map((h) => `"${h}"`).join(' + ')}. Demote all but the page title to <h2>.`,
      ),
    ];
  }
  return [];
}

export function checkCanonical(input: PageInput): Finding[] {
  const { expectedCanonical, facts, path } = input;
  if (facts.canonical === null || facts.canonical === '') {
    return [
      finding(
        'canonical-missing',
        'error',
        path,
        `No <link rel="canonical">. Expected ${expectedCanonical}.`,
      ),
    ];
  }
  const normalize = (url: string) => url.replace(/\/$/, '');
  if (normalize(facts.canonical) !== normalize(expectedCanonical)) {
    return [
      finding(
        'canonical-mismatch',
        'error',
        path,
        `Canonical is ${facts.canonical}, expected ${expectedCanonical}.`,
      ),
    ];
  }
  return [];
}

const REQUIRED_OG_TAGS = [
  'og:title',
  'og:description',
  'og:image',
  'og:url',
  'og:type',
] as const;

export function checkSocialTags(input: PageInput): Finding[] {
  const { facts, path } = input;
  const findings: Finding[] = [];

  const missing = REQUIRED_OG_TAGS.filter(
    (tag) => (facts.openGraph[tag] ?? '') === '',
  );
  if (missing.length > 0) {
    findings.push(
      finding(
        'open-graph-incomplete',
        'error',
        path,
        `Missing ${missing.join(', ')}.`,
      ),
    );
  }
  if ((facts.twitter['twitter:card'] ?? '') === '') {
    findings.push(
      finding('twitter-card-missing', 'warning', path, 'No twitter:card.'),
    );
  }
  return findings;
}

export function checkContent(input: PageInput): Finding[] {
  const { facts, path } = input;
  const findings: Finding[] = [];

  if (facts.wordCount < MIN_WORD_COUNT) {
    findings.push(
      finding(
        'low-word-count',
        'warning',
        path,
        `${facts.wordCount} words (min ${MIN_WORD_COUNT}).`,
      ),
    );
  }
  if (facts.internalLinkCount === 0) {
    findings.push(
      finding(
        'no-outgoing-links',
        'error',
        path,
        'No internal links — the page is a crawl dead end.',
      ),
    );
  }
  if (facts.imagesWithoutAlt > 0) {
    findings.push(
      finding(
        'image-alt-missing',
        'warning',
        path,
        `${facts.imagesWithoutAlt} <img> without an alt attribute.`,
      ),
    );
  }
  return findings;
}

/**
 * Required properties per schema.org type, taken from Google's rich-result
 * eligibility rules. A type absent from this table is not validated.
 */
const REQUIRED_SCHEMA_FIELDS: Record<string, readonly string[]> = {
  Article: ['headline', 'image', 'datePublished', 'author'],
  BlogPosting: ['headline', 'image', 'datePublished', 'author'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  Offer: ['price', 'priceCurrency'],
  Organization: ['name', 'url', 'logo'],
  Product: ['name', 'image', 'offers'],
  SoftwareApplication: [
    'name',
    'applicationCategory',
    'offers',
    'aggregateRating',
  ],
  WebSite: ['name', 'url'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typesOf(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  if (typeof raw === 'string') {
    return [raw];
  }
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === 'string');
  }
  return [];
}

/** Depth-first walk over every typed node in a JSON-LD document. */
export function collectTypedNodes(
  value: unknown,
  accumulator: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTypedNodes(item, accumulator);
    }
    return accumulator;
  }
  if (!isRecord(value)) {
    return accumulator;
  }
  if (typesOf(value).length > 0) {
    accumulator.push(value);
  }
  for (const child of Object.values(value)) {
    collectTypedNodes(child, accumulator);
  }
  return accumulator;
}

export function checkStructuredData(input: PageInput): Finding[] {
  const { facts, path } = input;
  const findings: Finding[] = [];

  for (const block of facts.jsonLd) {
    if (block.parseError !== null) {
      findings.push(
        finding(
          'json-ld-invalid',
          'error',
          path,
          `Unparseable application/ld+json: ${block.parseError}`,
        ),
      );
      continue;
    }

    for (const node of collectTypedNodes(block.value)) {
      for (const type of typesOf(node)) {
        const required = REQUIRED_SCHEMA_FIELDS[type];
        if (required === undefined) {
          continue;
        }
        const missing = required.filter((field) => {
          const value = node[field];
          return (
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0)
          );
        });
        if (missing.length > 0) {
          findings.push(
            finding(
              'structured-data-incomplete',
              'error',
              path,
              `${type} is missing ${missing.join(', ')} — not eligible for a rich result.`,
            ),
          );
        }
      }
    }
  }
  return findings;
}

/** Absolute URLs referenced by BreadcrumbList items, for resolution checks. */
export function collectBreadcrumbTargets(facts: PageFacts): string[] {
  const targets: string[] = [];
  for (const block of facts.jsonLd) {
    for (const node of collectTypedNodes(block.value)) {
      if (!typesOf(node).includes('BreadcrumbList')) {
        continue;
      }
      const items = node.itemListElement;
      if (!Array.isArray(items)) {
        continue;
      }
      for (const item of items) {
        if (!isRecord(item)) {
          continue;
        }
        const target = item.item;
        if (typeof target === 'string') {
          targets.push(target);
        } else if (isRecord(target) && typeof target['@id'] === 'string') {
          targets.push(target['@id']);
        }
      }
    }
  }
  return targets;
}

const PAGE_RULES = [
  checkSoftNotFound,
  checkTitle,
  checkDescription,
  checkHeadings,
  checkCanonical,
  checkSocialTags,
  checkContent,
  checkStructuredData,
] as const;

export function auditPage(input: PageInput): Finding[] {
  return PAGE_RULES.flatMap((rule) => rule(input));
}

/**
 * Cross-page rule: the same meta description reused across pages makes them
 * compete for the same query. Reported once per duplicated description.
 */
export function checkDuplicateDescriptions(
  inputs: readonly PageInput[],
): Finding[] {
  const byDescription = new Map<string, string[]>();
  for (const { facts, path } of inputs) {
    const description = facts.description;
    if (description === null || description === '') {
      continue;
    }
    const paths = byDescription.get(description) ?? [];
    paths.push(path);
    byDescription.set(description, paths);
  }

  const findings: Finding[] = [];
  for (const [description, paths] of byDescription) {
    if (paths.length < 2) {
      continue;
    }
    const sorted = [...paths].sort();
    findings.push(
      finding(
        'description-duplicate',
        'error',
        sorted[0] ?? '',
        `Shared by ${paths.length} pages (${sorted.slice(0, 5).join(', ')}${paths.length > 5 ? ', …' : ''}): "${description.slice(0, 80)}"`,
      ),
    );
  }
  return findings;
}

/** Cross-page rule: duplicate titles compete in the same way descriptions do. */
export function checkDuplicateTitles(inputs: readonly PageInput[]): Finding[] {
  const byTitle = new Map<string, string[]>();
  for (const { facts, path } of inputs) {
    const title = facts.title;
    if (title === null || title === '') {
      continue;
    }
    const paths = byTitle.get(title) ?? [];
    paths.push(path);
    byTitle.set(title, paths);
  }

  const findings: Finding[] = [];
  for (const [title, paths] of byTitle) {
    if (paths.length < 2) {
      continue;
    }
    const sorted = [...paths].sort();
    findings.push(
      finding(
        'title-duplicate',
        'error',
        sorted[0] ?? '',
        `Shared by ${paths.length} pages (${sorted.slice(0, 5).join(', ')}${paths.length > 5 ? ', …' : ''}): "${title}"`,
      ),
    );
  }
  return findings;
}

/** Indexable pages absent from the sitemap are discoverable only by crawling. */
export function checkSitemapCoverage(
  inputs: readonly PageInput[],
  sitemap: ReadonlySet<string>,
): Finding[] {
  return inputs
    .filter(({ facts, path }) => {
      const robots = (facts.robots ?? '').toLowerCase();
      return !robots.includes('noindex') && !sitemap.has(path);
    })
    .map(({ path }) =>
      finding(
        'not-in-sitemap',
        'error',
        path,
        'Indexable but absent from /sitemap.xml.',
      ),
    );
}

/** Sitemap entries that no longer resolve advertise dead URLs to search engines. */
export function checkSitemapEntriesResolve(
  sitemap: ReadonlySet<string>,
  reachable: ReadonlySet<string>,
): Finding[] {
  return [...sitemap]
    .filter((path) => !reachable.has(path))
    .sort()
    .map((path) =>
      finding(
        'sitemap-url-unreachable',
        'error',
        path,
        'Listed in /sitemap.xml but did not return 200.',
      ),
    );
}

export function summarize(findings: readonly Finding[]): {
  errors: number;
  warnings: number;
  byRule: Map<string, number>;
} {
  const byRule = new Map<string, number>();
  for (const item of findings) {
    byRule.set(item.rule, (byRule.get(item.rule) ?? 0) + 1);
  }
  return {
    byRule,
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
  };
}
