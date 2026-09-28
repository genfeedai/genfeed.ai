#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDiff,
  dispositionSummary,
  isDirectHardCut,
  isPriorOnlyHardCut,
  persistSnapshot,
} from './snapshot.mjs';

let chromium;
let load;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// biome-ignore lint/suspicious/noUndeclaredEnvVars: Standalone operator script, outside Turborepo tasks.
const REPORT_DIR = process.env.SEO_REPORT_DIR || join(REPO_ROOT, 'reports/seo');
const DISPOSITIONS_PATH =
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: Standalone operator script, outside Turborepo tasks.
  process.env.SEO_DISPOSITIONS_PATH ||
  join(REPO_ROOT, 'docs/seo/5515-dispositions.json');
const LATEST_PATH = join(REPORT_DIR, 'latest.json');
const BRAVE_EXECUTABLE =
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const ORIGINS = [
  'https://genfeed.ai',
  'https://docs.genfeed.ai',
  'https://marketplace.genfeed.ai',
  'https://app.genfeed.ai',
];
const EXTRACTION_METHOD =
  'Rendered DOM: use visible innerText from main, otherwise article, otherwise body; normalize whitespace; count Unicode word tokens matching letters/numbers with internal apostrophes/hyphens.';
const USER_AGENT =
  'Mozilla/5.0 (compatible; GenfeedSEOwatchdog/1.0; +https://genfeed.ai)';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETIRED_ROUTE_PREFIXES = new Map([
  ['https://genfeed.ai', ['/demo']],
  ['https://marketplace.genfeed.ai', ['/blog', '/free', '/featured']],
]);
const RESOURCE_EXTENSION =
  /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|map|mov|mp3|mp4|mpeg|ogg|otf|pdf|png|pptx?|rss|svg|tar|tiff?|ttf|txt|wav|webm|webp|woff2?|xlsx?|xml|zip)$/i;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const unicodeLength = (value) => Array.from(value ?? '').length;

function snapshotId(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function normalizeUrl(value, base, { preserveQuery = false } = {}) {
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')
    ) {
      url.port = '';
    }
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, '');
    if (!preserveQuery) {
      url.search = '';
    } else {
      const params = [...url.searchParams.entries()]
        .filter(([key]) => !/^(?:utm_|fbclid$|gclid$|ref$)/i.test(key))
        .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
          `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`),
        );
      url.search = '';
      for (const [key, entry] of params) url.searchParams.append(key, entry);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function intendedCrawlUrl(value, origin) {
  const normalized = normalizeUrl(value, origin);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.origin !== origin) return null;
  if (RESOURCE_EXTENSION.test(url.pathname)) return null;
  if (url.pathname.startsWith('/_next/')) return null;
  return normalized;
}

function selectedHeaders(headers) {
  const get = (name) => headers.get(name);
  return {
    'content-type': get('content-type'),
    'x-robots-tag': get('x-robots-tag'),
    'strict-transport-security': get('strict-transport-security'),
    'cache-control': get('cache-control'),
    'content-language': get('content-language'),
    location: get('location'),
    server: get('server'),
  };
}

async function fetchOnce(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    return await fetch(url, {
      redirect: 'manual',
      headers: {
        'user-agent': USER_AGENT,
        accept:
          'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRedirects(initialUrl, maxRedirects = 8) {
  const hops = [];
  let current = initialUrl;
  let response;
  for (let hopIndex = 0; hopIndex <= maxRedirects; hopIndex += 1) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetchOnce(current);
        if (RETRYABLE_STATUSES.has(response.status) && attempt < 3) {
          await sleep(300 * attempt);
          continue;
        }
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await sleep(300 * attempt);
      }
    }
    if (lastError || !response)
      throw lastError ?? new Error(`No response for ${current}`);

    const location = response.headers.get('location');
    hops.push({
      url: current,
      status: response.status,
      location,
      headers: selectedHeaders(response.headers),
    });
    if (response.status >= 300 && response.status < 400 && location) {
      if (hopIndex === maxRedirects)
        throw new Error(`Redirect limit exceeded for ${initialUrl}`);
      current = new URL(location, current).toString();
      continue;
    }
    const text = await response.text();
    return {
      status: response.status,
      finalUrl: current,
      redirectHops: hops,
      responseHeaders: selectedHeaders(response.headers),
      contentType: response.headers.get('content-type') ?? '',
      text,
    };
  }
  throw new Error(`Redirect loop for ${initialUrl}`);
}

function parseRobots(text) {
  const sitemapUrls = [];
  const groups = [];
  let current = null;
  for (const originalLine of text.split(/\r?\n/)) {
    const line = originalLine.replace(/\s+#.*$/, '').trim();
    if (!line.includes(':')) continue;
    const separator = line.indexOf(':');
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'sitemap') {
      sitemapUrls.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!current || current.rules.length > 0) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(value.toLowerCase());
      continue;
    }
    if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ type: key, path: value });
    }
  }
  return { sitemapUrls: [...new Set(sitemapUrls)], groups };
}

function robotsDecision(parsed, url) {
  const pathname = `${new URL(url).pathname}${new URL(url).search}`;
  const googleGroups = parsed.groups.filter((group) =>
    group.userAgents.some((agent) => agent === 'googlebot'),
  );
  const groups = googleGroups.length
    ? googleGroups
    : parsed.groups.filter((group) => group.userAgents.includes('*'));
  const matches = [];
  for (const group of groups) {
    for (const rule of group.rules) {
      if (!rule.path) continue;
      const escaped = rule.path
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\$$/, '$');
      try {
        if (new RegExp(`^${escaped}`).test(pathname)) matches.push(rule);
      } catch {
        // An invalid robots pattern cannot be applied reliably.
      }
    }
  }
  matches.sort((left, right) => {
    if (right.path.length !== left.path.length)
      return right.path.length - left.path.length;
    return left.type === 'allow' ? -1 : 1;
  });
  const matched = matches[0] ?? null;
  return {
    allowed: !matched || matched.type === 'allow',
    matchedRule: matched,
  };
}

function extractXmlEntries(xml) {
  const $ = load(xml, { xmlMode: true });
  const rootName =
    $.root().children().first().get(0)?.tagName?.toLowerCase() ?? '';
  if (rootName === 'sitemapindex') {
    return {
      valid: true,
      isIndex: true,
      childSitemaps: $('sitemap > loc')
        .map((_, element) => $(element).text().trim())
        .get()
        .filter(Boolean),
      entries: [],
    };
  }
  if (rootName === 'urlset') {
    const entries = $('url')
      .map((_, element) => {
        const node = $(element);
        const rawPriority = node.find('priority').first().text().trim();
        return {
          url: node.find('loc').first().text().trim(),
          lastmod: node.find('lastmod').first().text().trim() || null,
          changefreq: node.find('changefreq').first().text().trim() || null,
          priority:
            rawPriority === '' || Number.isNaN(Number(rawPriority))
              ? null
              : Number(rawPriority),
        };
      })
      .get()
      .filter((entry) => entry.url);
    return { valid: true, isIndex: false, childSitemaps: [], entries };
  }
  return { valid: false, isIndex: false, childSitemaps: [], entries: [] };
}

function textOf($, selector) {
  return $(selector).first().attr('content')?.trim() ?? '';
}

function absoluteAttribute(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function extractFetchedDom(html, base) {
  const $ = load(html);
  const links = $('a[href]')
    .map((_, element) => absoluteAttribute($(element).attr('href'), base))
    .get()
    .filter(Boolean);
  const navLinks = $('nav a[href], header a[href]')
    .map((_, element) => absoluteAttribute($(element).attr('href'), base))
    .get()
    .filter(Boolean);
  const missingAltSources = $('img')
    .filter((_, element) => !($(element).attr('alt') ?? '').trim())
    .map(
      (_, element) =>
        absoluteAttribute($(element).attr('src'), base) || '(missing src)',
    )
    .get();
  const mixedContent = [];
  $('[src], [href]').each((_, element) => {
    for (const attribute of ['src', 'href']) {
      const value = $(element).attr(attribute);
      if (value?.startsWith('http://')) mixedContent.push(value);
    }
  });
  return {
    title: $('title').first().text().trim(),
    description: textOf($, 'meta[name="description" i]'),
    h1_strings: $('h1')
      .map((_, element) => $(element).text().replace(/\s+/g, ' ').trim())
      .get(),
    canonical: absoluteAttribute(
      $('link[rel="canonical" i]').first().attr('href'),
      base,
    ),
    og_title: textOf($, 'meta[property="og:title" i]'),
    og_description: textOf($, 'meta[property="og:description" i]'),
    og_image: absoluteAttribute(
      $('meta[property="og:image" i]').first().attr('content'),
      base,
    ),
    twitter_card: textOf($, 'meta[name="twitter:card" i]'),
    meta_robots: $('meta[name="robots" i], meta[name="googlebot" i]')
      .map((_, element) => ($(element).attr('content') ?? '').trim())
      .get()
      .filter(Boolean),
    links: [...new Set(links)],
    nav_links: [...new Set(navLinks)],
    image_count: $('img').length,
    missing_alt_sources: missingAltSources,
    mixed_content: [...new Set(mixedContent)],
    json_ld_raw: $('script[type="application/ld+json" i]')
      .map((_, element) => $(element).text().trim())
      .get(),
  };
}

async function extractRenderedDom(page, url) {
  const navigation = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(400);
  await page
    .waitForLoadState('networkidle', { timeout: 2_500 })
    .catch(() => {});
  const extracted = await page.evaluate(() => {
    const absolute = (value) => {
      if (!value) return '';
      try {
        return new URL(value, document.baseURI).toString();
      } catch {
        return value;
      }
    };
    const meta = (selector) =>
      document.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
    const links = [...document.querySelectorAll('a[href]')]
      .map((element) => absolute(element.getAttribute('href')))
      .filter(Boolean);
    const navLinks = [
      ...document.querySelectorAll('nav a[href], header a[href]'),
    ]
      .map((element) => absolute(element.getAttribute('href')))
      .filter(Boolean);
    const images = [...document.querySelectorAll('img')];
    const mixed = [];
    for (const element of document.querySelectorAll('[src], [href]')) {
      for (const attribute of ['src', 'href']) {
        const value = element.getAttribute(attribute);
        if (value?.startsWith('http://')) mixed.push(value);
      }
    }
    const main =
      document.querySelector('main') ??
      document.querySelector('article') ??
      document.body;
    return {
      title: document.title.trim(),
      description: meta('meta[name="description" i]'),
      h1_strings: [...document.querySelectorAll('h1')].map((element) =>
        (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
      canonical: absolute(
        document.querySelector('link[rel="canonical" i]')?.getAttribute('href'),
      ),
      og_title: meta('meta[property="og:title" i]'),
      og_description: meta('meta[property="og:description" i]'),
      og_image: absolute(meta('meta[property="og:image" i]')),
      twitter_card: meta('meta[name="twitter:card" i]'),
      meta_robots: [
        ...document.querySelectorAll(
          'meta[name="robots" i], meta[name="googlebot" i]',
        ),
      ]
        .map((element) => element.getAttribute('content')?.trim() ?? '')
        .filter(Boolean),
      links: [...new Set(links)],
      nav_links: [...new Set(navLinks)],
      image_count: images.length,
      missing_alt_sources: images
        .filter((element) => !(element.getAttribute('alt') ?? '').trim())
        .map(
          (element) => absolute(element.getAttribute('src')) || '(missing src)',
        ),
      mixed_content: [...new Set(mixed)],
      json_ld_raw: [
        ...document.querySelectorAll('script[type="application/ld+json" i]'),
      ].map((element) => (element.textContent ?? '').trim()),
      main_text: (main?.innerText ?? '').replace(/\s+/g, ' ').trim(),
      body_text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
  return {
    ...extracted,
    navigation_status: navigation?.status() ?? null,
    final_url: page.url(),
  };
}

function collectSchemaNodes(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectSchemaNodes(entry, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  output.push(value);
  if (Array.isArray(value['@graph']))
    collectSchemaNodes(value['@graph'], output);
  for (const [key, child] of Object.entries(value)) {
    if (key !== '@graph' && child && typeof child === 'object')
      collectSchemaNodes(child, output);
  }
  return output;
}

function schemaTypes(parsed) {
  const types = [];
  for (const node of collectSchemaNodes(parsed, [])) {
    const raw = node['@type'];
    for (const type of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      if (typeof type === 'string') types.push(type);
    }
  }
  return [...new Set(types)];
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function requiredSchemaMissing(parsed) {
  const missing = [];
  for (const node of collectSchemaNodes(parsed, [])) {
    const rawTypes = Array.isArray(node['@type'])
      ? node['@type']
      : [node['@type']];
    if (
      rawTypes.includes('Article') ||
      rawTypes.includes('NewsArticle') ||
      rawTypes.includes('BlogPosting')
    ) {
      if (!hasValue(node.headline)) missing.push('headline');
      if (!hasValue(node.image)) missing.push('image');
      if (!hasValue(node.datePublished)) missing.push('datePublished');
      if (!hasValue(node.author)) missing.push('author');
    }
    if (rawTypes.includes('Product')) {
      if (!hasValue(node.name)) missing.push('name');
      if (!node.offers && !node.review && !node.aggregateRating) {
        missing.push('one of offers, aggregateRating or review');
      }
    }
    if (rawTypes.includes('SoftwareApplication')) {
      if (!hasValue(node.name)) missing.push('name');
      const offers = Array.isArray(node.offers)
        ? node.offers
        : node.offers
          ? [node.offers]
          : [];
      if (!offers.some((offer) => hasValue(offer?.price)))
        missing.push('offers.price');
      if (!node.aggregateRating && !node.review)
        missing.push('one of aggregateRating or review');
    }
    if (rawTypes.includes('BreadcrumbList')) {
      if (
        !Array.isArray(node.itemListElement) ||
        node.itemListElement.length === 0
      ) {
        missing.push('itemListElement');
      } else {
        node.itemListElement.forEach((item, index) => {
          if (!hasValue(item?.position))
            missing.push(`itemListElement[${index}].position`);
          if (!hasValue(item?.name))
            missing.push(`itemListElement[${index}].name`);
          if (
            index < node.itemListElement.length - 1 &&
            !hasValue(item?.item)
          ) {
            missing.push(`itemListElement[${index}].item`);
          }
        });
      }
    }
  }
  return [...new Set(missing)];
}

function breadcrumbItems(parsed) {
  const items = [];
  for (const node of collectSchemaNodes(parsed, [])) {
    const rawTypes = Array.isArray(node['@type'])
      ? node['@type']
      : [node['@type']];
    if (
      !rawTypes.includes('BreadcrumbList') ||
      !Array.isArray(node.itemListElement)
    )
      continue;
    for (const item of node.itemListElement) {
      const rawUrl =
        typeof item?.item === 'string' ? item.item : item?.item?.['@id'];
      items.push({
        position: item?.position ?? null,
        name: item?.name ?? '',
        url: rawUrl ?? '',
      });
    }
  }
  return items;
}

function parseJsonLd(rawBlocks) {
  return rawBlocks.map((raw, index) => {
    try {
      const parsed = JSON.parse(raw);
      return {
        index,
        raw,
        parsed,
        parse_error: null,
        types: schemaTypes(parsed),
        google_required_missing: requiredSchemaMissing(parsed),
        breadcrumb_items: breadcrumbItems(parsed),
      };
    } catch (error) {
      return {
        index,
        raw,
        parsed: null,
        parse_error: error instanceof Error ? error.message : String(error),
        types: [],
        google_required_missing: [],
        breadcrumb_items: [],
      };
    }
  });
}

function countWords(text) {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function soft404Evidence(record) {
  if (record.http_status !== 200 || !record.rendered_dom) return [];
  const evidence = [];
  const title = record.rendered_dom.title;
  if (
    /\b(?:404|not found|page does not exist|page doesn't exist)\b/i.test(title)
  ) {
    evidence.push(`title: ${JSON.stringify(title)}`);
  }
  for (const h1 of record.rendered_dom.h1_strings) {
    if (
      /\b(?:404|not found|page does not exist|page doesn't exist)\b/i.test(h1)
    ) {
      evidence.push(`h1: ${JSON.stringify(h1)}`);
    }
  }
  const main = (record.rendered_dom.main_text ?? '').trim();
  const match = main.match(
    /^(?:404\b|page not found\b|not found\b|the (?:requested )?page (?:does not|doesn't) exist\b|we (?:could not|couldn't) find (?:that|this) page\b).{0,200}/i,
  );
  if (match) evidence.push(`main: ${JSON.stringify(match[0].trim())}`);
  return [...new Set(evidence)];
}

function retiredRoutePrefix(record) {
  const prefixes = RETIRED_ROUTE_PREFIXES.get(record.origin) ?? [];
  const pathname = new URL(record.normalized_url).pathname;
  return (
    prefixes.find(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ?? null
  );
}

function directives(values) {
  return values
    .flatMap((value) => value.split(/[;,]/))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function issueFingerprint(url, rule) {
  return createHash('sha256').update(`${url}\n${rule}`).digest('hex');
}

function impactBase(rule, severity, record) {
  const bases = {
    app_indexable: 300,
    canonical_mismatch: 245,
    missing_canonical: 190,
    http_error: 160,
    soft_404: 158,
    sitemap_url_unreachable: 155,
    indexable_absent_sitemap: 150,
    robots_http_200: 220,
    sitemap_http_200: 215,
    robots_declares_effective_sitemap: 205,
    sitemap_wrong_origin: 200,
    invalid_sitemap_xml: 195,
    invalid_json_ld: 145,
    breadcrumb_intermediate_404: 145,
    h1_count: 120,
    missing_title: 120,
    missing_meta_description: 112,
    duplicate_title: 100,
    duplicate_meta_description: 95,
    zero_internal_outlinks: 90,
    hsts_missing: 90,
    mixed_content: 90,
    title_length: 55,
    meta_description_length: 54,
    thin_content: 45,
    images_missing_alt: 42,
    missing_twitter_card: 35,
    redirect_chain: 30,
  };
  const proxy = record
    ? Math.min(30, record.internal_inlink_count ?? 0) +
      Math.min(20, (record.nav_internal_inlink_count ?? 0) * 2) +
      (record.in_sitemap ? 12 : 0) +
      (record.url === `${record.origin}/` ? 20 : 0)
    : 0;
  const nonIndexableDiscount =
    record && !record.robots.indexable && rule !== 'app_indexable' ? 150 : 0;
  return Math.max(
    1,
    (bases[rule] ?? (severity === 'error' ? 100 : 40)) +
      proxy -
      nonIndexableDiscount,
  );
}

function addIssue(
  collection,
  priorIssueMap,
  completedAt,
  input,
  record = null,
) {
  const normalized = normalizeUrl(input.url, input.url) ?? input.url;
  const fingerprint = issueFingerprint(normalized, input.rule);
  const prior = priorIssueMap.get(fingerprint);
  const firstSeen = prior?.first_seen ?? completedAt;
  const ageDays = Math.max(
    0,
    Math.floor((Date.parse(completedAt) - Date.parse(firstSeen)) / 86_400_000),
  );
  collection.push({
    fingerprint,
    severity: input.severity,
    rule: input.rule,
    url: input.url,
    normalized_url: normalized,
    observed: input.observed,
    expected: input.expected,
    impact_score: impactBase(input.rule, input.severity, record),
    first_seen: firstSeen,
    last_seen: completedAt,
    age_days: ageDays,
  });
}

async function loadPriorSnapshot() {
  try {
    const parsed = JSON.parse(await readFile(LATEST_PATH, 'utf8'));
    return parsed.status === 'success' ? parsed : null;
  } catch {
    return null;
  }
}

export function extractLlmsPageLinks(text, origin) {
  const destinations = [
    ...Array.from(
      text.matchAll(/\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g),
      (match) => match[1],
    ),
    ...Array.from(text.matchAll(/https?:\/\/[^\s<>"'`]+/g), (match) =>
      match[0].replace(/[.,;:!?)\]}]+$/, ''),
    ),
  ];
  return [
    ...new Set(
      destinations
        .map((value) => intendedCrawlUrl(value, origin))
        .filter(Boolean),
    ),
  ];
}

export async function auditLlmsResources(
  origin,
  checkFailures,
  fetchResource = fetchWithRedirects,
) {
  const resources = [];
  for (const path of ['/llms.txt', '/llms-full.txt']) {
    const url = `${origin}${path}`;
    try {
      const response = await fetchResource(url);
      const available = response.status >= 200 && response.status < 300;
      if (!available && ![404, 410].includes(response.status)) {
        checkFailures.push({
          check: 'llms_fetch',
          url,
          reason: `HTTP ${response.status}: llms resource unavailable.`,
        });
      }
      resources.push({
        url,
        status: response.status,
        final_url: response.finalUrl,
        redirect_hops: response.redirectHops,
        page_links: available
          ? extractLlmsPageLinks(response.text, origin)
          : [],
      });
    } catch (error) {
      checkFailures.push({
        check: 'llms_fetch',
        url,
        reason: error instanceof Error ? error.message : String(error),
      });
      resources.push({
        url,
        status: null,
        final_url: null,
        redirect_hops: [],
        page_links: [],
      });
    }
  }
  return resources;
}

export function addLlmsDiscovery(queue, entries, originState) {
  for (const resource of originState.llms ?? []) {
    for (const url of resource.page_links) {
      addQueueEntry(
        queue,
        entries,
        url,
        originState.origin,
        0,
        'llms.txt',
        resource.url,
      );
    }
  }
}

async function auditOriginInfrastructure(origin, checkFailures) {
  const robotsUrl = `${origin}/robots.txt`;
  const requestedSitemap = `${origin}/sitemap.xml`;
  let robotsFetch;
  try {
    robotsFetch = await fetchWithRedirects(robotsUrl);
  } catch (error) {
    checkFailures.push({
      check: 'robots_fetch',
      url: robotsUrl,
      reason: error instanceof Error ? error.message : String(error),
    });
    robotsFetch = {
      status: null,
      finalUrl: robotsUrl,
      redirectHops: [],
      contentType: '',
      text: '',
      responseHeaders: {},
    };
  }
  const parsedRobots = parseRobots(robotsFetch.text);
  const sitemapQueue = [requestedSitemap, ...parsedRobots.sitemapUrls];
  const seenSitemaps = new Set();
  const sitemapFiles = [];
  const pageEntries = [];
  while (sitemapQueue.length && seenSitemaps.size < 50) {
    const sitemapUrl = normalizeUrl(sitemapQueue.shift(), origin, {
      preserveQuery: true,
    });
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    try {
      const response = await fetchWithRedirects(sitemapUrl);
      const xml = extractXmlEntries(response.text);
      sitemapFiles.push({
        url: sitemapUrl,
        final_url: response.finalUrl,
        status: response.status,
        redirect_hops: response.redirectHops,
        content_type: response.contentType,
        valid_xml: xml.valid,
        is_index: xml.isIndex,
        entries: xml.entries,
      });
      if (response.status === 200 && xml.valid) {
        pageEntries.push(...xml.entries);
        sitemapQueue.push(...xml.childSitemaps);
      }
    } catch (error) {
      checkFailures.push({
        check: 'sitemap_fetch',
        url: sitemapUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
      sitemapFiles.push({
        url: sitemapUrl,
        final_url: sitemapUrl,
        status: null,
        redirect_hops: [],
        content_type: '',
        valid_xml: false,
        is_index: false,
        entries: [],
      });
    }
  }
  if (sitemapQueue.length)
    checkFailures.push({
      check: 'sitemap_limit',
      url: origin,
      reason: 'Sitemap resource limit reached with unprocessed resources.',
    });
  const uniqueEntries = [
    ...new Map(
      pageEntries.map((entry) => [normalizeUrl(entry.url, origin), entry]),
    ).values(),
  ].filter((entry) => entry && normalizeUrl(entry.url, origin));
  return {
    origin,
    robots: {
      url: robotsUrl,
      status: robotsFetch.status,
      final_url: robotsFetch.finalUrl,
      redirect_hops: robotsFetch.redirectHops,
      content_type: robotsFetch.contentType,
      text: robotsFetch.text,
      parsed: parsedRobots,
    },
    sitemap: {
      requested_url: requestedSitemap,
      effective_url:
        sitemapFiles.find((file) => file.url === requestedSitemap)?.final_url ??
        requestedSitemap,
      declared_urls: parsedRobots.sitemapUrls,
      files: sitemapFiles,
      page_entries: uniqueEntries,
    },
    llms: await auditLlmsResources(origin, checkFailures),
    selected_pagespeed_targets: [],
    url_count: 0,
    rendered_count: 0,
  };
}

async function auditPage({
  entry,
  originState,
  browserContext,
  checkFailures,
}) {
  const url = entry.url;
  let fetched;
  try {
    fetched = await fetchWithRedirects(url);
  } catch (error) {
    checkFailures.push({
      check: 'page_fetch',
      url,
      reason: error instanceof Error ? error.message : String(error),
    });
    return {
      url,
      normalized_url: url,
      canonicalized_identity: url,
      origin: originState.origin,
      discovered_depth: entry.depth,
      discovery_sources: [...entry.sources].sort(),
      discovery_source_urls: [...entry.sourceUrls].sort(),
      fetch_error: error instanceof Error ? error.message : String(error),
      http_status: null,
      final_url: url,
      redirect_hops: [],
      response_headers: {},
      content_type: '',
      rendered_dom: null,
      fetched_dom: null,
      internal_inlink_count: 0,
      nav_internal_inlink_count: 0,
    };
  }
  const isHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(
    fetched.contentType,
  );
  const fetchedDom = isHtml
    ? extractFetchedDom(fetched.text, fetched.finalUrl)
    : null;
  let renderedDom = null;
  if (isHtml) {
    const page = await browserContext.newPage();
    try {
      renderedDom = await extractRenderedDom(page, url);
    } catch (error) {
      checkFailures.push({
        check: 'rendered_dom',
        url,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await page.close();
    }
  }
  const effectiveDom = renderedDom ??
    fetchedDom ?? {
      title: '',
      description: '',
      h1_strings: [],
      canonical: '',
      og_title: '',
      og_description: '',
      og_image: '',
      twitter_card: '',
      meta_robots: [],
      links: [],
      nav_links: [],
      image_count: 0,
      missing_alt_sources: [],
      mixed_content: [],
      json_ld_raw: [],
      main_text: '',
    };
  const normalizedFinal =
    normalizeUrl(fetched.finalUrl, url) ?? fetched.finalUrl;
  const normalizedCanonical = effectiveDom.canonical
    ? normalizeUrl(effectiveDom.canonical, normalizedFinal, {
        preserveQuery: true,
      })
    : null;
  const metaDirectives = directives(effectiveDom.meta_robots ?? []);
  const xRobotsTag = fetched.responseHeaders['x-robots-tag'] ?? '';
  const xDirectives = directives([xRobotsTag]);
  const robots = robotsDecision(originState.robots.parsed, url);
  const sitemapEntry = originState.sitemap.page_entries.find(
    (candidate) => normalizeUrl(candidate.url, originState.origin) === url,
  );
  const jsonLd = parseJsonLd(effectiveDom.json_ld_raw ?? []);
  const internalOutlinks = [
    ...new Set(
      (effectiveDom.links ?? [])
        .map((link) => intendedCrawlUrl(link, originState.origin))
        .filter(Boolean),
    ),
  ];
  const navInternalOutlinks = [
    ...new Set(
      (effectiveDom.nav_links ?? [])
        .map((link) => intendedCrawlUrl(link, originState.origin))
        .filter(Boolean),
    ),
  ];
  const record = {
    url,
    normalized_url: url,
    canonicalized_identity: normalizedCanonical ?? normalizedFinal,
    origin: originState.origin,
    discovered_depth: entry.depth,
    discovery_sources: [...entry.sources].sort(),
    discovery_source_urls: [...entry.sourceUrls].sort(),
    http_status: fetched.status,
    final_url: fetched.finalUrl,
    redirect_hops: fetched.redirectHops,
    response_headers: fetched.responseHeaders,
    content_type: fetched.contentType,
    https: {
      initial: new URL(url).protocol === 'https:',
      final: new URL(fetched.finalUrl).protocol === 'https:',
      hsts: fetched.responseHeaders['strict-transport-security'],
    },
    robots: {
      rules_allowed: robots.allowed,
      matched_rule: robots.matchedRule,
      meta_directives: metaDirectives,
      x_robots_tag: xRobotsTag,
      indexable:
        robots.allowed &&
        !metaDirectives.includes('noindex') &&
        !xDirectives.includes('noindex'),
    },
    title: {
      exact: effectiveDom.title ?? '',
      unicode_count: unicodeLength(effectiveDom.title),
    },
    meta_description: {
      exact: effectiveDom.description ?? '',
      unicode_count: unicodeLength(effectiveDom.description),
    },
    h1: {
      count: effectiveDom.h1_strings?.length ?? 0,
      strings: effectiveDom.h1_strings ?? [],
    },
    canonical: {
      exact: effectiveDom.canonical ?? '',
      normalized: normalizedCanonical,
      self_referencing: normalizedCanonical === normalizedFinal,
    },
    open_graph: {
      title: effectiveDom.og_title ?? '',
      description: effectiveDom.og_description ?? '',
      image: effectiveDom.og_image ?? '',
    },
    twitter_card: effectiveDom.twitter_card ?? '',
    json_ld: jsonLd,
    main_content: {
      word_count: countWords(effectiveDom.main_text ?? ''),
      extraction_method: EXTRACTION_METHOD,
    },
    internal_outlinks: {
      count: internalOutlinks.length,
      urls: internalOutlinks,
    },
    nav_internal_outlinks: navInternalOutlinks,
    images: {
      count: effectiveDom.image_count ?? 0,
      missing_usable_alt_count: effectiveDom.missing_alt_sources?.length ?? 0,
      missing_usable_alt_sources: effectiveDom.missing_alt_sources ?? [],
    },
    in_sitemap: Boolean(sitemapEntry),
    sitemap_entry: sitemapEntry ?? null,
    soft_404_evidence: [],
    mixed_content: {
      fetched: fetchedDom?.mixed_content ?? [],
      rendered: renderedDom?.mixed_content ?? [],
    },
    fetched_dom: fetchedDom,
    rendered_dom: renderedDom,
    breadcrumb_url_checks: [],
    internal_inlink_count: 0,
    nav_internal_inlink_count: 0,
  };
  record.soft_404_evidence = soft404Evidence(record);
  return record;
}

function addQueueEntry(
  queue,
  entries,
  url,
  origin,
  depth,
  source,
  sourceUrl = null,
) {
  const normalized = intendedCrawlUrl(url, origin);
  if (!normalized) return;
  const existing = entries.get(normalized);
  if (existing) {
    existing.depth = Math.min(existing.depth, depth);
    existing.sources.add(source);
    if (sourceUrl) existing.sourceUrls.add(sourceUrl);
    return;
  }
  const entry = {
    url: normalized,
    depth,
    sources: new Set([source]),
    sourceUrls: new Set(sourceUrl ? [sourceUrl] : []),
    processed: false,
  };
  entries.set(normalized, entry);
  queue.push(entry);
}

async function crawlOrigin({
  originState,
  priorSnapshot,
  browser,
  checkFailures,
}) {
  const queue = [];
  const entries = new Map();
  addQueueEntry(
    queue,
    entries,
    `${originState.origin}/`,
    originState.origin,
    0,
    'origin_homepage',
  );
  for (const sitemapEntry of originState.sitemap.page_entries) {
    addQueueEntry(
      queue,
      entries,
      sitemapEntry.url,
      originState.origin,
      0,
      'sitemap',
    );
  }

  addLlmsDiscovery(queue, entries, originState);

  const browserContext = await browser.newContext({
    userAgent: USER_AGENT,
    ignoreHTTPSErrors: false,
    viewport: { width: 1440, height: 1000 },
  });
  const records = [];
  try {
    while (queue.length && records.length < 600) {
      const entry = queue.shift();
      if (entry.processed) continue;
      entry.processed = true;
      const record = await auditPage({
        entry,
        originState,
        browserContext,
        checkFailures,
      });
      records.push(record);
      const links =
        record.rendered_dom?.links ?? record.fetched_dom?.links ?? [];
      if (entry.depth < 3 && record.http_status && record.http_status < 400) {
        for (const link of links) {
          addQueueEntry(
            queue,
            entries,
            link,
            originState.origin,
            entry.depth + 1,
            'rendered_internal_link',
            record.url,
          );
        }
      }
    }
    if (queue.some((entry) => !entry.processed))
      checkFailures.push({
        check: 'crawl_limit',
        url: originState.origin,
        reason: 'Page limit reached with unprocessed URLs.',
      });
    // Prior URLs are never discovery seeds. Probe each missing URL once after the
    // current sitemap and rendered links have determined the authoritative set.
    for (const priorRecord of priorSnapshot?.urls ?? []) {
      if (
        priorRecord.origin !== originState.origin ||
        entries.has(priorRecord.normalized_url)
      )
        continue;
      const priorOnly = {
        url: priorRecord.normalized_url,
        depth: priorRecord.discovered_depth ?? 0,
        sources: new Set(['prior_successful_snapshot']),
        sourceUrls: new Set(),
      };
      records.push(
        await auditPage({
          entry: priorOnly,
          originState,
          browserContext,
          checkFailures,
        }),
      );
    }
  } finally {
    await browserContext.close();
  }
  return records;
}

function calculateInlinks(records) {
  const byUrl = new Map(
    records.map((record) => [record.normalized_url, record]),
  );
  const sources = new Map();
  const navSources = new Map();
  for (const record of records) {
    for (const target of record.internal_outlinks?.urls ?? []) {
      if (!sources.has(target)) sources.set(target, new Set());
      sources.get(target).add(record.normalized_url);
    }
    for (const target of record.nav_internal_outlinks ?? []) {
      if (!navSources.has(target)) navSources.set(target, new Set());
      navSources.get(target).add(record.normalized_url);
    }
  }
  for (const [url, record] of byUrl) {
    record.internal_inlink_count = sources.get(url)?.size ?? 0;
    record.nav_internal_inlink_count = navSources.get(url)?.size ?? 0;
  }
}

async function auditBreadcrumbs(records, checkFailures) {
  const cache = new Map();
  for (const record of records) {
    const items = record.json_ld.flatMap(
      (block) => block.breadcrumb_items ?? [],
    );
    for (const item of items) {
      const normalized = normalizeUrl(item.url, record.url);
      if (!normalized) continue;
      let result = cache.get(normalized);
      if (!result) {
        try {
          const response = await fetchWithRedirects(normalized);
          result = {
            url: normalized,
            status: response.status,
            final_url: response.finalUrl,
            redirect_hops: response.redirectHops,
          };
        } catch (error) {
          result = {
            url: normalized,
            status: null,
            final_url: normalized,
            redirect_hops: [],
          };
          checkFailures.push({
            check: 'breadcrumb_url',
            url: normalized,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
        cache.set(normalized, result);
      }
      record.breadcrumb_url_checks.push(result);
    }
  }
}

export function makeIssues({
  records,
  originStates,
  priorSnapshot,
  completedAt,
}) {
  const priorIssueMap = new Map(
    (priorSnapshot?.issues ?? []).map((issue) => [issue.fingerprint, issue]),
  );
  const issues = [];
  const recordByUrl = new Map(
    records.map((record) => [record.normalized_url, record]),
  );
  const issue = (input, record = null) =>
    addIssue(issues, priorIssueMap, completedAt, input, record);

  for (const state of Object.values(originStates)) {
    if (state.robots.status !== 200) {
      issue({
        severity: 'error',
        rule: 'robots_http_200',
        url: state.robots.url,
        observed: `HTTP ${state.robots.status ?? 'unavailable'}`,
        expected: 'HTTP 200',
      });
    }
    const rootSitemap = state.sitemap.files.find(
      (file) =>
        normalizeUrl(file.url, state.origin) ===
        normalizeUrl(state.sitemap.requested_url, state.origin),
    );
    if (rootSitemap?.status !== 200) {
      issue({
        severity: 'error',
        rule: 'sitemap_http_200',
        url: state.sitemap.requested_url,
        observed: `HTTP ${rootSitemap?.status ?? 'unavailable'}`,
        expected: 'HTTP 200',
      });
    }
    const effectiveSitemap = normalizeUrl(
      state.sitemap.effective_url,
      state.origin,
      { preserveQuery: true },
    );
    const declared = state.sitemap.declared_urls.map((url) =>
      normalizeUrl(url, state.origin, { preserveQuery: true }),
    );
    if (!effectiveSitemap || !declared.includes(effectiveSitemap)) {
      issue({
        severity: 'error',
        rule: 'robots_declares_effective_sitemap',
        url: state.robots.url,
        observed: state.sitemap.declared_urls,
        expected: `Sitemap: ${state.sitemap.effective_url}`,
      });
    }
    for (const file of state.sitemap.files) {
      if (file.status !== 200) {
        issue({
          severity: 'error',
          rule: 'sitemap_url_unreachable',
          url: file.url,
          observed: `HTTP ${file.status ?? 'unavailable'}`,
          expected: 'HTTP 200',
        });
      } else if (!file.valid_xml) {
        issue({
          severity: 'error',
          rule: 'invalid_sitemap_xml',
          url: file.url,
          observed: file.content_type,
          expected: 'Valid XML sitemap or sitemap index',
        });
      }
      for (const entry of file.entries) {
        const entryUrl = normalizeUrl(entry.url, state.origin);
        if (entryUrl && new URL(entryUrl).origin !== state.origin) {
          issue({
            severity: 'error',
            rule: 'sitemap_wrong_origin',
            url: file.url,
            observed: entry.url,
            expected: `A URL on ${state.origin}`,
          });
        }
      }
    }
  }

  for (const record of records) {
    if (isPriorOnlyHardCut(record)) continue;
    const isHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(
      record.content_type ?? '',
    );
    const usable =
      record.http_status >= 200 && record.http_status < 300 && isHtml;
    if (record.http_status === null) {
      issue(
        {
          severity: 'error',
          rule: 'fetch_failed',
          url: record.url,
          observed: record.fetch_error ?? 'Unavailable',
          expected: 'Successful HTTP fetch',
        },
        record,
      );
      continue;
    }
    const retiredPrefix = retiredRoutePrefix(record);
    if (
      retiredPrefix &&
      record.http_status !== null &&
      !isDirectHardCut(record)
    ) {
      issue(
        {
          severity: 'error',
          rule: 'retired_route_not_hard_cut',
          url: record.url,
          observed: {
            retired_prefix: retiredPrefix,
            http_status: record.http_status,
            final_url: record.final_url,
          },
          expected: 'Direct HTTP 404 or 410 with no redirect',
        },
        record,
      );
    }
    if (record.http_status >= 400) {
      issue(
        {
          severity: 'error',
          rule: 'http_error',
          url: record.url,
          observed: `HTTP ${record.http_status}`,
          expected: 'HTTP 2xx or valid redirect destination',
        },
        record,
      );
      continue;
    }
    if (record.redirect_hops.length - 1 > 1) {
      issue(
        {
          severity: 'warning',
          rule: 'redirect_chain',
          url: record.url,
          observed: `${record.redirect_hops.length - 1} redirect hops`,
          expected: 'At most one redirect hop',
        },
        record,
      );
    }
    if (record.https.final && !record.https.hsts) {
      issue(
        {
          severity: 'error',
          rule: 'hsts_missing',
          url: record.url,
          observed: '',
          expected: 'Strict-Transport-Security header on HTTPS responses',
        },
        record,
      );
    }
    const mixed = [
      ...new Set([
        ...record.mixed_content.fetched,
        ...record.mixed_content.rendered,
      ]),
    ];
    if (mixed.length) {
      issue(
        {
          severity: 'error',
          rule: 'mixed_content',
          url: record.url,
          observed: mixed,
          expected: 'HTTPS resource URLs only',
        },
        record,
      );
    }
    if (record.origin === 'https://app.genfeed.ai' && record.robots.indexable) {
      issue(
        {
          severity: 'error',
          rule: 'app_indexable',
          url: record.url,
          observed: record.robots,
          expected:
            'Non-indexable through robots.txt, meta robots, or X-Robots-Tag',
        },
        record,
      );
    }
    if (!usable) continue;
    if (record.soft_404_evidence.length) {
      issue(
        {
          severity: 'error',
          rule: 'soft_404',
          url: record.url,
          observed: record.soft_404_evidence,
          expected: 'A real content page for HTTP 200',
        },
        record,
      );
      continue;
    }
    if (!record.title.exact) {
      issue(
        {
          severity: 'error',
          rule: 'missing_title',
          url: record.url,
          observed: '',
          expected: 'A non-empty title',
        },
        record,
      );
    } else if (
      record.title.unicode_count < 30 ||
      record.title.unicode_count > 60
    ) {
      issue(
        {
          severity: 'warning',
          rule: 'title_length',
          url: record.url,
          observed: {
            exact: record.title.exact,
            unicode_count: record.title.unicode_count,
          },
          expected: '30–60 Unicode characters',
        },
        record,
      );
    }
    if (!record.meta_description.exact) {
      issue(
        {
          severity: 'error',
          rule: 'missing_meta_description',
          url: record.url,
          observed: '',
          expected: 'A non-empty meta description',
        },
        record,
      );
    } else if (
      record.meta_description.unicode_count < 110 ||
      record.meta_description.unicode_count > 160
    ) {
      issue(
        {
          severity: 'warning',
          rule: 'meta_description_length',
          url: record.url,
          observed: {
            exact: record.meta_description.exact,
            unicode_count: record.meta_description.unicode_count,
          },
          expected: '110–160 Unicode characters',
        },
        record,
      );
    }
    if (record.h1.count !== 1) {
      issue(
        {
          severity: 'error',
          rule: 'h1_count',
          url: record.url,
          observed: { count: record.h1.count, strings: record.h1.strings },
          expected: 'Exactly one H1',
        },
        record,
      );
    }
    if (!record.canonical.exact) {
      issue(
        {
          severity: 'error',
          rule: 'missing_canonical',
          url: record.url,
          observed: '',
          expected: 'Self-referencing canonical URL',
        },
        record,
      );
    } else if (!record.canonical.self_referencing) {
      issue(
        {
          severity: 'error',
          rule: 'canonical_mismatch',
          url: record.url,
          observed: record.canonical,
          expected: `Self-reference ${normalizeUrl(record.final_url, record.url) ?? record.final_url}`,
        },
        record,
      );
    }
    for (const block of record.json_ld) {
      if (block.parse_error) {
        issue(
          {
            severity: 'error',
            rule: `invalid_json_ld_${block.index}`,
            url: record.url,
            observed: block.parse_error,
            expected: 'Valid JSON-LD',
          },
          record,
        );
      }
      if (block.google_required_missing.length) {
        const relevantType =
          block.types.find((type) =>
            [
              'Article',
              'NewsArticle',
              'BlogPosting',
              'Product',
              'SoftwareApplication',
              'BreadcrumbList',
            ].includes(type),
          ) ?? 'Schema';
        issue(
          {
            severity: 'error',
            rule: `schema_required_${relevantType}_${block.index}`,
            url: record.url,
            observed: block.google_required_missing,
            expected: `All current Google-required ${relevantType} fields`,
          },
          record,
        );
      }
    }
    if (record.robots.indexable && !record.in_sitemap) {
      issue(
        {
          severity: 'error',
          rule: 'indexable_absent_sitemap',
          url: record.url,
          observed: { indexable: true, in_sitemap: false },
          expected: 'Present in the origin sitemap',
        },
        record,
      );
    }
    if (record.internal_outlinks.count === 0) {
      issue(
        {
          severity: 'error',
          rule: 'zero_internal_outlinks',
          url: record.url,
          observed: 0,
          expected: 'At least one same-origin internal outlink',
        },
        record,
      );
    }
    if (record.images.missing_usable_alt_count > 0) {
      issue(
        {
          severity: 'warning',
          rule: 'images_missing_alt',
          url: record.url,
          observed: {
            count: record.images.missing_usable_alt_count,
            sources: record.images.missing_usable_alt_sources,
          },
          expected: 'Usable alt text on every image',
        },
        record,
      );
    }
    if (!record.twitter_card) {
      issue(
        {
          severity: 'warning',
          rule: 'missing_twitter_card',
          url: record.url,
          observed: '',
          expected: 'A twitter:card meta tag',
        },
        record,
      );
    }
    if (record.main_content.word_count < 200) {
      issue(
        {
          severity: 'warning',
          rule: 'thin_content',
          url: record.url,
          observed: `${record.main_content.word_count} words`,
          expected: 'At least 200 visible main-content words',
        },
        record,
      );
    }
    for (const breadcrumb of record.breadcrumb_url_checks.slice(0, -1)) {
      if (breadcrumb.status === 404) {
        issue(
          {
            severity: 'error',
            rule: 'breadcrumb_intermediate_404',
            url: record.url,
            observed: { breadcrumb_url: breadcrumb.url, status: 404 },
            expected: 'Reachable breadcrumb intermediate URL',
          },
          record,
        );
      }
    }
  }

  const usableRecords = records.filter(
    (record) =>
      record.http_status >= 200 &&
      record.http_status < 300 &&
      /(?:text\/html|application\/xhtml\+xml)/i.test(
        record.content_type ?? '',
      ) &&
      record.soft_404_evidence.length === 0,
  );
  for (const [field, rule, expected] of [
    ['title', 'duplicate_title', 'A unique title across all four origins'],
    [
      'meta_description',
      'duplicate_meta_description',
      'A unique meta description across all four origins',
    ],
  ]) {
    const groups = new Map();
    for (const record of usableRecords) {
      const exact = record[field].exact;
      if (!exact) continue;
      if (!groups.has(exact)) groups.set(exact, new Map());
      const identity = record.canonicalized_identity ?? record.normalized_url;
      const identityGroups = groups.get(exact);
      if (!identityGroups.has(identity)) identityGroups.set(identity, []);
      identityGroups.get(identity).push(record);
    }
    for (const [exact, identityGroups] of groups) {
      if (identityGroups.size < 2) continue;
      const duplicateUrls = [...identityGroups.keys()].sort();
      const duplicateRecords = [...identityGroups.entries()].map(
        ([identity, candidates]) =>
          candidates.find((record) => record.normalized_url === identity) ??
          candidates[0],
      );
      for (const record of duplicateRecords) {
        issue(
          {
            severity: 'error',
            rule,
            url: record.url,
            observed: {
              exact,
              unicode_count: unicodeLength(exact),
              duplicate_urls: duplicateUrls,
            },
            expected,
          },
          record,
        );
      }
    }
  }

  issues.sort(
    (left, right) =>
      right.impact_score - left.impact_score ||
      left.normalized_url.localeCompare(right.normalized_url) ||
      left.rule.localeCompare(right.rule),
  );
  return { issues, priorIssueMap, recordByUrl };
}

function selectPageSpeedTargets(originState, originRecords, priorSnapshot) {
  const usable = originRecords.filter(
    (record) =>
      record.http_status >= 200 &&
      record.http_status < 300 &&
      /text\/html/i.test(record.content_type),
  );
  if (usable.length < 5) return [];
  const byUrl = new Map(
    usable.map((record) => [record.normalized_url, record]),
  );
  const selected = [];
  const priorTargets =
    priorSnapshot?.origins?.[originState.origin]?.selected_pagespeed_targets ??
    [];
  for (const target of priorTargets) {
    const normalized = normalizeUrl(target.url, originState.origin);
    const record = byUrl.get(normalized);
    if (!record || selected.some((entry) => entry.url === normalized)) continue;
    selected.push({
      url: normalized,
      selection_evidence: target.selection_evidence,
      api_requested_url_this_run: normalized,
    });
  }
  const ranked = [...usable].sort((left, right) => {
    const leftHome = left.url === `${originState.origin}/` ? 1 : 0;
    const rightHome = right.url === `${originState.origin}/` ? 1 : 0;
    const leftPriority = left.sitemap_entry?.priority ?? -1;
    const rightPriority = right.sitemap_entry?.priority ?? -1;
    return (
      rightHome - leftHome ||
      right.nav_internal_inlink_count - left.nav_internal_inlink_count ||
      rightPriority - leftPriority ||
      right.internal_inlink_count - left.internal_inlink_count ||
      left.url.localeCompare(right.url)
    );
  });
  for (const record of ranked) {
    if (selected.length >= 5) break;
    if (selected.some((entry) => entry.url === record.normalized_url)) continue;
    selected.push({
      url: record.normalized_url,
      selection_evidence: {
        homepage: record.url === `${originState.origin}/`,
        primary_navigation_inlink_count: record.nav_internal_inlink_count,
        sitemap_priority: record.sitemap_entry?.priority ?? null,
        internal_inlink_count: record.internal_inlink_count,
      },
      replacement_reason: priorTargets.length
        ? 'Prior target removed or no longer usable'
        : undefined,
      api_requested_url_this_run: record.normalized_url,
    });
  }
  return selected.slice(0, 5).map((target) => {
    if (target.replacement_reason === undefined)
      delete target.replacement_reason;
    return target;
  });
}

function metricValue(metrics, key, divisor = 1) {
  const value = metrics?.[key]?.percentile;
  return typeof value === 'number' ? value / divisor : null;
}

async function queryPageSpeed(targets, checkFailures) {
  const results = [];
  for (const target of targets) {
    const endpoint = new URL(
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
    );
    endpoint.searchParams.set('url', target.url);
    endpoint.searchParams.set('strategy', 'mobile');
    endpoint.searchParams.set('category', 'performance');
    try {
      const response = await fetch(endpoint, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      const payloadText = await response.text();
      let payload;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const message =
          payload?.error?.message ??
          (payloadText.slice(0, 500) || response.statusText);
        const reason = `HTTP ${response.status}: ${message}`;
        results.push({
          url: target.url,
          strategy: 'mobile',
          status: 'unavailable',
          scope: 'unavailable',
          lcp: null,
          cls: null,
          inp: null,
          reason,
        });
        checkFailures.push({
          check: 'pagespeed_field_data',
          url: target.url,
          reason,
        });
      } else {
        const urlMetrics = payload?.loadingExperience?.metrics;
        const originMetrics = payload?.originLoadingExperience?.metrics;
        const metrics = urlMetrics ?? originMetrics;
        const scope = urlMetrics
          ? 'url'
          : originMetrics
            ? 'origin'
            : 'unavailable';
        if (!metrics) {
          results.push({
            url: target.url,
            strategy: 'mobile',
            status: 'unavailable',
            scope,
            lcp: null,
            cls: null,
            inp: null,
            reason: 'CrUX field data absent for both URL and origin.',
          });
        } else {
          results.push({
            url: target.url,
            strategy: 'mobile',
            status: 'available',
            scope,
            lcp: metricValue(metrics, 'LARGEST_CONTENTFUL_PAINT_MS'),
            cls: metricValue(metrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE', 100),
            inp: metricValue(metrics, 'INTERACTION_TO_NEXT_PAINT'),
            reason: null,
          });
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results.push({
        url: target.url,
        strategy: 'mobile',
        status: 'unavailable',
        scope: 'unavailable',
        lcp: null,
        cls: null,
        inp: null,
        reason,
      });
      checkFailures.push({
        check: 'pagespeed_field_data',
        url: target.url,
        reason,
      });
    }
    await sleep(250);
  }
  return results;
}

const started = new Date();
const id = snapshotId(started);
const checkFailures = [];
const originStates = {};
const records = [];
let priorSnapshot = null;
let activeCheck = 'startup';
let activeUrl = null;

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  activeCheck = 'load_dependencies';
  ({ chromium } = await import('@playwright/test'));
  ({ load } = await import('cheerio'));
  priorSnapshot = await loadPriorSnapshot();

  for (const origin of ORIGINS) {
    activeCheck = 'origin_infrastructure';
    activeUrl = origin;
    originStates[origin] = await auditOriginInfrastructure(
      origin,
      checkFailures,
    );
  }

  let browser;
  activeCheck = 'headless_brave_launch';
  activeUrl = BRAVE_EXECUTABLE;
  try {
    browser = await chromium.launch({
      executablePath: BRAVE_EXECUTABLE,
      headless: true,
      args: [
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
  } catch (error) {
    checkFailures.push({
      check: 'headless_brave_launch',
      url: BRAVE_EXECUTABLE,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  try {
    for (const origin of ORIGINS) {
      activeCheck = 'crawl_origin';
      activeUrl = origin;
      const originRecords = await crawlOrigin({
        originState: originStates[origin],
        priorSnapshot,
        browser,
        checkFailures,
      });
      records.push(...originRecords);
      originStates[origin].url_count = originRecords.length;
      originStates[origin].rendered_count = originRecords.filter(
        (record) => record.rendered_dom,
      ).length;
    }
  } finally {
    await browser.close();
  }

  activeCheck = 'post_crawl_analysis';
  activeUrl = null;
  calculateInlinks(records);
  await auditBreadcrumbs(records, checkFailures);
  const targets = [];
  for (const origin of ORIGINS) {
    const originRecords = records.filter((record) => record.origin === origin);
    const selected = selectPageSpeedTargets(
      originStates[origin],
      originRecords,
      priorSnapshot,
    );
    originStates[origin].selected_pagespeed_targets = selected;
    targets.push(...selected);
  }
  const pageSpeed = await queryPageSpeed(targets, checkFailures);
  const completed = new Date();
  const completedAt = completed.toISOString();
  const { issues, recordByUrl } = makeIssues({
    records,
    originStates,
    priorSnapshot,
    completedAt,
  });
  const diff = buildDiff({ issues, priorSnapshot, recordByUrl, completedAt });
  const perOrigin = Object.fromEntries(
    ORIGINS.map((origin) => [
      origin,
      {
        url_count: originStates[origin].url_count,
        rendered_count: originStates[origin].rendered_count,
        sitemap_url_count: originStates[origin].sitemap.page_entries.length,
      },
    ]),
  );
  const snapshot = {
    schema_version: 1,
    snapshot_id: id,
    status: 'success',
    started_at: started.toISOString(),
    completed_at: completedAt,
    duration_seconds: Math.round(
      (completed.getTime() - started.getTime()) / 1000,
    ),
    prior_successful_snapshot_id: priorSnapshot?.snapshot_id ?? null,
    prior_successful_snapshot_path: priorSnapshot
      ? join(REPORT_DIR, `${priorSnapshot.snapshot_id}.json`)
      : null,
    crawl_metadata: {
      origins: ORIGINS,
      max_rendered_link_depth: 3,
      fetch_retries: 3,
      extraction_method: EXTRACTION_METHOD,
      traffic_data_available: false,
      ranking_proxies: [
        'origin role',
        'primary navigation prominence',
        'sitemap priority',
        'internal inlink count',
      ],
      fetched_url_count: records.length,
      rendered_url_count: records.filter((record) => record.rendered_dom)
        .length,
      sitemap_resource_count: Object.values(originStates).reduce(
        (sum, state) => sum + state.sitemap.files.length,
        0,
      ),
      per_origin: perOrigin,
    },
    origins: originStates,
    urls: records
      .filter((record) => !isPriorOnlyHardCut(record))
      .sort(
        (left, right) =>
          left.origin.localeCompare(right.origin) ||
          left.url.localeCompare(right.url),
      ),
    prior_only_hard_cut_probes: records
      .filter(isPriorOnlyHardCut)
      .sort(
        (left, right) =>
          left.origin.localeCompare(right.origin) ||
          left.url.localeCompare(right.url),
      ),
    page_speed: pageSpeed,
    issues,
    issue_counts: {
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
      total: issues.length,
    },
    diff,
    check_failures: checkFailures,
  };

  if (
    records.length === 0 ||
    ORIGINS.some(
      (origin) => !records.some((record) => record.origin === origin),
    ) ||
    new Set(records.map((record) => record.normalized_url)).size !==
      records.length
  ) {
    checkFailures.push({
      check: 'snapshot_coverage',
      url: null,
      reason: 'Missing origin records or duplicate URL identities.',
    });
  }
  let inventory = null;
  let inventoryError = null;
  try {
    inventory = JSON.parse(await readFile(DISPOSITIONS_PATH, 'utf8'));
  } catch (error) {
    inventoryError = error instanceof Error ? error.message : String(error);
  }
  snapshot.disposition_summary = dispositionSummary(
    issues,
    inventory,
    DISPOSITIONS_PATH,
    inventoryError,
    records,
  );
  activeCheck = 'persist_snapshot';
  const outputPath = await persistSnapshot(REPORT_DIR, snapshot);
  if (snapshot.status !== 'success') {
    process.exitCode = 1;
    console.error(
      `Incomplete crawl saved to ${outputPath}; latest.json preserved.`,
    );
    return;
  }
  console.log(
    JSON.stringify(
      {
        snapshot_path: outputPath,
        latest_path: LATEST_PATH,
        prior_snapshot: snapshot.prior_successful_snapshot_path,
        coverage: snapshot.crawl_metadata,
        issue_counts: snapshot.issue_counts,
        diff_counts: Object.fromEntries(
          Object.entries(diff).map(([key, value]) => [key, value.length]),
        ),
        check_failure_count: checkFailures.length,
        top_errors: issues
          .filter((issue) => issue.severity === 'error')
          .slice(0, 10),
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(async (error) => {
    const reason = error instanceof Error ? error.message : String(error);
    if (
      !checkFailures.some(
        (failure) => failure.check === activeCheck && failure.reason === reason,
      )
    ) {
      checkFailures.push({ check: activeCheck, url: activeUrl, reason });
    }
    try {
      await persistSnapshot(REPORT_DIR, {
        schema_version: 1,
        snapshot_id: id,
        status: 'partial',
        started_at: started.toISOString(),
        completed_at: new Date().toISOString(),
        prior_successful_snapshot_id: priorSnapshot?.snapshot_id ?? null,
        origins: originStates,
        urls: records,
        check_failures: checkFailures,
      });
    } catch (writeError) {
      console.error('Unable to save partial snapshot:', writeError);
    }
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
