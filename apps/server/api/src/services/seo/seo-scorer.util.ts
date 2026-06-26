import * as cheerio from 'cheerio';

import {
  SEO_DIMENSION_MAX,
  type SeoCheck,
  type SeoDimension,
  type SeoRating,
  type SeoScorableContent,
  type SeoScorecard,
  type SeoScorecardMeta,
} from './seo-scorer.types';

// ─── Text helpers (deterministic) ────────────────────────────────────────

/** Strip HTML tags and collapse whitespace into plain text. */
export function stripHtmlToText(html: string): string {
  if (!html) {
    return '';
  }
  // cheerio gives accurate text extraction; fall back to regex if parse fails.
  try {
    return cheerio.load(html).root().text().replace(/\s+/g, ' ').trim();
  } catch {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/** Count words in plain text. */
export function countWords(text: string): number {
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).filter(Boolean).length;
}

/** Split plain text into sentences. */
export function splitSentences(text: string): string[] {
  if (!text) {
    return [];
  }
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[a-z0-9]/i.test(sentence));
}

/** Estimate syllables in a single word (heuristic, English). */
export function countSyllablesInWord(word: string): number {
  const normalised = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!normalised) {
    return 0;
  }
  if (normalised.length <= 3) {
    return 1;
  }
  const groups = normalised
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

/**
 * Flesch Reading Ease (0-100, higher = easier).
 * `206.835 − 1.015 × (words/sentences) − 84.6 × (syllables/words)`.
 *
 * NOTE: the only existing implementation lives in the frontend-only
 * `@genfeedai/services` package (a private class behind a Bearer-token
 * factory, with no tsconfig alias inside the NestJS API), so it cannot be
 * imported here. We re-implement the same canonical formula deterministically.
 */
export function fleschReadingEase(text: string): number {
  const sentences = splitSentences(text);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) {
    return 0;
  }
  const syllables = words.reduce(
    (total, word) => total + countSyllablesInWord(word),
    0,
  );
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const score =
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/**
 * Keyword density as a word-coverage percentage:
 * `(occurrences × phrase_word_count) / total_words × 100`.
 * For a single-word keyword this is the usual occurrences/total*100; for a
 * multi-word phrase it reflects the share of words the phrase occupies.
 * Returns null when no keyword is supplied.
 */
export function computeKeywordDensity(
  text: string,
  keyword?: string | null,
): number | null {
  const normalisedKeyword = (keyword ?? '').trim().toLowerCase();
  if (!normalisedKeyword) {
    return null;
  }
  const totalWords = countWords(text);
  if (totalWords === 0) {
    return 0;
  }
  const escaped = normalisedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.toLowerCase().match(new RegExp(escaped, 'g'));
  const occurrences = matches ? matches.length : 0;
  const keywordWordSpan = normalisedKeyword.split(/\s+/).filter(Boolean).length;
  return (
    Math.round(((occurrences * keywordWordSpan) / totalWords) * 10000) / 100
  );
}

const GENERIC_ANCHORS = new Set([
  'click here',
  'here',
  'read more',
  'learn more',
  'this',
  'link',
  'this link',
  'more',
  'click',
  'go',
]);

const CTA_TERMS = [
  'subscribe',
  'sign up',
  'signup',
  'get started',
  'contact',
  'download',
  'try ',
  'learn more',
  'buy',
  'book a',
  'join',
  'start ',
  'register',
];

const TRANSITION_WORDS = [
  'however',
  'therefore',
  'additionally',
  'furthermore',
  'moreover',
  'for example',
  'for instance',
  'in addition',
  'consequently',
  'meanwhile',
  'nevertheless',
  'on the other hand',
  'as a result',
  'in contrast',
  'similarly',
  'finally',
  'first',
  'second',
  'next',
  'then',
  'because',
  'although',
  'while',
  'in conclusion',
];

interface ParsedSeoHtml {
  plainText: string;
  wordCount: number;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  links: Array<{
    href: string;
    text: string;
    isInternal: boolean;
    isExternal: boolean;
    opensNewTab: boolean;
    isWellFormed: boolean;
  }>;
  images: Array<{ src: string; alt: string }>;
  hasList: boolean;
  hasInPageAnchors: boolean;
  hasJsonLd: boolean;
  hasVideoEmbed: boolean;
  hasCaptionTrack: boolean;
  h1Count: number;
}

/** Parse HTML body into the structured signals the scorer needs. */
export function parseSeoHtml(html?: string | null): ParsedSeoHtml {
  const $ = cheerio.load(html ?? '');

  const headings: Array<{ level: number; text: string }> = [];
  $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
    const level = Number((el as { tagName?: string }).tagName?.charAt(1) ?? 0);
    headings.push({ level, text: $(el).text().trim() });
  });

  const paragraphs: string[] = [];
  $('p').each((_i, el) => {
    const text = $(el).text().trim();
    if (text) {
      paragraphs.push(text);
    }
  });

  const links: ParsedSeoHtml['links'] = [];
  $('a[href]').each((_i, el) => {
    const href = ($(el).attr('href') ?? '').trim();
    const text = $(el).text().trim();
    const isAbsolute = /^https?:\/\//i.test(href);
    const isAnchorOnly = href.startsWith('#');
    // Named fragment links (#section) are valid HTML; only bare '#' and
    // javascript: URIs are malformed.
    const isWellFormed =
      href.length > 0 && !href.startsWith('javascript:') && href !== '#';
    links.push({
      href,
      isExternal: isAbsolute,
      // In-page anchors are jump links, not content internal links.
      isInternal: isWellFormed && !isAbsolute && !isAnchorOnly,
      isWellFormed,
      opensNewTab: ($(el).attr('target') ?? '') === '_blank',
      text,
    });
  });

  const images: ParsedSeoHtml['images'] = [];
  $('img').each((_i, el) => {
    images.push({
      alt: ($(el).attr('alt') ?? '').trim(),
      src: ($(el).attr('src') ?? '').trim(),
    });
  });

  const plainText = $.root().text().replace(/\s+/g, ' ').trim();

  return {
    h1Count: $('h1').length,
    hasCaptionTrack: $('track').length > 0,
    hasInPageAnchors: $('a[href^="#"]').length > 0,
    hasJsonLd: $('script[type="application/ld+json"]').length > 0,
    hasList: $('ul, ol').length > 0,
    hasVideoEmbed: $('iframe, video').length > 0,
    headings,
    images,
    links,
    paragraphs,
    plainText,
    wordCount: countWords(plainText),
  };
}

// ─── Scoring band helpers ────────────────────────────────────────────────

/** Award `full` inside the ideal band, decaying toward 0 further out. */
function bandScore(
  value: number,
  ideal: [number, number],
  full: number,
): number {
  const [lo, hi] = ideal;
  if (value >= lo && value <= hi) {
    return full;
  }
  const width = Math.max(1, hi - lo);
  const distance = value < lo ? lo - value : value - hi;
  const steps = Math.ceil(distance / width);
  return Math.max(0, full - steps);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ─── Deterministic + heuristic check engine ──────────────────────────────

/**
 * Build the full set of scored checks for a piece of content. Deterministic
 * checks are scored exactly; qualitative checks carry a deterministic
 * heuristic baseline that the LLM layer may later refine.
 */
export function buildSeoChecks(input: SeoScorableContent): SeoCheck[] {
  const html = input.content ?? '';
  const parsed = parseSeoHtml(html);
  const plainText = parsed.plainText;
  const title = (input.title ?? '').trim();
  const meta = (input.metaDescription ?? '').trim();
  const slug = (input.slug ?? '').trim();
  const keyword = (input.targetKeyword ?? '').trim();
  const hasKeyword = keyword.length > 0;
  const keywordLower = keyword.toLowerCase();
  const secondaryKeywords = (input.secondaryKeywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const checks: SeoCheck[] = [];
  const add = (
    dimension: SeoDimension,
    id: string,
    label: string,
    max: number,
    points: number,
    note: string,
    options?: { kind?: 'deterministic' | 'qualitative'; available?: boolean },
  ): void => {
    checks.push({
      available: options?.available ?? true,
      dimension,
      id,
      kind: options?.kind ?? 'deterministic',
      label,
      max,
      note,
      points: Math.max(0, Math.min(max, Math.round(points))),
    });
  };

  // ── Dimension 1: Keyword Placement (20) ──
  const firstHundredWords = plainText.split(/\s+/).slice(0, 100).join(' ');
  const h2Texts = parsed.headings
    .filter((h) => h.level === 2)
    .map((h) => h.text.toLowerCase());
  const subheadingTexts = parsed.headings
    .filter((h) => h.level >= 2)
    .map((h) => h.text.toLowerCase());
  const density = computeKeywordDensity(plainText, keyword);

  add(
    'keywordPlacement',
    'kw_in_title',
    'Primary keyword in title/H1',
    4,
    hasKeyword && includesCaseInsensitive(title, keyword) ? 4 : 0,
    hasKeyword
      ? 'Include the primary keyword in the title.'
      : 'Provide a target keyword to audit keyword placement.',
    { available: hasKeyword },
  );
  add(
    'keywordPlacement',
    'kw_in_first_100',
    'Primary keyword in first 100 words',
    3,
    hasKeyword && includesCaseInsensitive(firstHundredWords, keyword) ? 3 : 0,
    'Mention the primary keyword naturally in the opening paragraph.',
    { available: hasKeyword },
  );
  add(
    'keywordPlacement',
    'kw_in_slug',
    'Primary keyword in URL slug',
    3,
    hasKeyword && includesCaseInsensitive(slug.replace(/-/g, ' '), keyword)
      ? 3
      : 0,
    'Add the primary keyword to the URL slug.',
    { available: hasKeyword },
  );
  add(
    'keywordPlacement',
    'kw_in_meta',
    'Primary keyword in meta description',
    3,
    hasKeyword && includesCaseInsensitive(meta, keyword) ? 3 : 0,
    'Include the primary keyword in the meta description.',
    { available: hasKeyword },
  );
  add(
    'keywordPlacement',
    'kw_in_h2',
    'Primary keyword in at least one H2',
    3,
    hasKeyword && h2Texts.some((t) => t.includes(keywordLower)) ? 3 : 0,
    'Use the primary keyword in at least one H2 heading.',
    { available: hasKeyword },
  );
  add(
    'keywordPlacement',
    'secondary_kw_in_subheadings',
    'Secondary keywords in subheadings',
    2,
    secondaryKeywords.length > 0 &&
      secondaryKeywords.some((k) => subheadingTexts.some((t) => t.includes(k)))
      ? 2
      : 0,
    'Work supporting keywords into H2/H3 subheadings.',
    { available: secondaryKeywords.length > 0 },
  );
  add(
    'keywordPlacement',
    'kw_density',
    'Keyword density 1-2%',
    2,
    density === null
      ? 0
      : density >= 1 && density <= 2
        ? 2
        : (density >= 0.5 && density < 1) || (density > 2 && density <= 3)
          ? 1
          : 0,
    density !== null && density > 3
      ? `Keyword density is ${density}% — reduce to avoid keyword stuffing.`
      : 'Target a keyword density of 1-2%.',
    { available: hasKeyword },
  );

  // ── Dimension 2: Content Structure (20) ──
  add(
    'contentStructure',
    'heading_hierarchy',
    'Proper heading hierarchy (H1→H2→H3)',
    5,
    scoreHeadingHierarchy(parsed),
    'Use a single H1 and avoid skipping heading levels.',
  );
  add(
    'contentStructure',
    'paragraph_length',
    'Paragraph length (2-3 sentences)',
    3,
    scoreParagraphLength(parsed.paragraphs),
    'Keep paragraphs to 2-3 sentences for scannability.',
  );
  const tocRequired = parsed.wordCount >= 2000;
  add(
    'contentStructure',
    'table_of_contents',
    'Table of contents for 2000+ words',
    3,
    !tocRequired ? 3 : parsed.hasInPageAnchors ? 3 : 0,
    tocRequired
      ? 'Add a table of contents with jump links for long-form content.'
      : 'Table of contents not required at this length.',
  );
  add(
    'contentStructure',
    'lists_used',
    'Bullet/numbered lists used',
    3,
    parsed.hasList ? 3 : 0,
    'Use bullet or numbered lists for parallel items.',
  );
  add(
    'contentStructure',
    'faq_section',
    'FAQ section present',
    3,
    heuristicFaqPresent(parsed) ? 3 : 0,
    'Add an FAQ section answering "People Also Ask" questions.',
    { kind: 'qualitative' },
  );
  const introWordCount = countWords(parsed.paragraphs[0] ?? '');
  add(
    'contentStructure',
    'intro_length',
    'Introduction under 150 words',
    2,
    parsed.paragraphs.length === 0
      ? 0
      : introWordCount <= 150
        ? 2
        : introWordCount <= 250
          ? 1
          : 0,
    'Tighten the introduction to under 150 words.',
  );
  add(
    'contentStructure',
    'conclusion_cta',
    'Conclusion with CTA',
    1,
    heuristicConclusionCta(parsed.paragraphs) ? 1 : 0,
    'End with a clear call to action.',
    { kind: 'qualitative' },
  );

  // ── Dimension 3: Readability (15) ──
  const flesch = fleschReadingEase(plainText);
  add(
    'readability',
    'flesch',
    'Flesch Reading Ease 60-70',
    4,
    plainText.length === 0 ? 0 : bandScore(flesch, [60, 70], 4),
    `Flesch Reading Ease is ${flesch}; aim for 60-70 (standard web readability).`,
  );
  add(
    'readability',
    'active_voice',
    'Active voice 80%+',
    3,
    scoreActiveVoice(plainText),
    'Favour active voice over passive constructions.',
    { kind: 'qualitative' },
  );
  add(
    'readability',
    'sentence_variance',
    'Sentence length variance',
    3,
    scoreSentenceVariance(plainText),
    'Vary sentence length — mix short and medium sentences.',
  );
  add(
    'readability',
    'transition_words',
    'Transition words in 30%+ sentences',
    3,
    scoreTransitionWords(plainText),
    'Add transition words ("however", "for example") to improve flow.',
  );
  add(
    'readability',
    'jargon_controlled',
    'No jargon without explanation',
    2,
    2,
    'Define technical terms on first use.',
    { kind: 'qualitative' },
  );

  // ── Dimension 4: Meta Optimization (15) ──
  add(
    'metaOptimization',
    'title_length',
    'Title tag 50-60 characters',
    4,
    title.length === 0 ? 0 : bandScore(title.length, [50, 60], 4),
    `Title is ${title.length} characters; aim for 50-60.`,
  );
  add(
    'metaOptimization',
    'meta_length',
    'Meta description 150-160 characters',
    4,
    meta.length === 0 ? 0 : bandScore(meta.length, [150, 160], 4),
    meta.length === 0
      ? 'Add a 150-160 character meta description.'
      : `Meta description is ${meta.length} characters; aim for 150-160.`,
  );
  add(
    'metaOptimization',
    'slug_format',
    'URL slug 3-5 words, hyphenated',
    3,
    scoreSlug(slug),
    'Use a clean 3-5 word hyphenated slug (no IDs or dates).',
  );
  add(
    'metaOptimization',
    'canonical_tag',
    'Canonical tag set',
    2,
    0,
    'Canonical tags are rendered outside content; verify at the page level.',
    { available: false },
  );
  add(
    'metaOptimization',
    'open_graph',
    'Open Graph tags present',
    2,
    0,
    'Open Graph tags are rendered outside content; verify at the page level.',
    { available: false },
  );

  // ── Dimension 5: Internal/External Links (10) ──
  const internalLinks = parsed.links.filter((l) => l.isInternal).length;
  const externalLinks = parsed.links.filter((l) => l.isExternal).length;
  const descriptiveLinks = parsed.links.filter(
    (l) => l.text.length > 0 && !GENERIC_ANCHORS.has(l.text.toLowerCase()),
  ).length;
  add(
    'links',
    'internal_links',
    '3-5 internal links',
    3,
    internalLinks >= 3 && internalLinks <= 5
      ? 3
      : (internalLinks >= 1 && internalLinks <= 2) ||
          (internalLinks >= 6 && internalLinks <= 8)
        ? 2
        : internalLinks > 8
          ? 1
          : 0,
    'Add 3-5 internal links to related content.',
  );
  add(
    'links',
    'external_links',
    '2-3 authoritative external links',
    2,
    externalLinks >= 2 && externalLinks <= 3
      ? 2
      : externalLinks === 1 || (externalLinks >= 4 && externalLinks <= 5)
        ? 1
        : 0,
    'Cite 2-3 authoritative external sources.',
  );
  add(
    'links',
    'descriptive_anchors',
    'Descriptive anchor text',
    3,
    parsed.links.length === 0
      ? 0
      : bandScoreRatio(ratio(descriptiveLinks, parsed.links.length), 3),
    'Use descriptive anchor text instead of "click here".',
  );
  add(
    'links',
    'no_broken_links',
    'No malformed links',
    1,
    // No links trivially satisfies "no malformed links".
    parsed.links.length === 0 || parsed.links.every((l) => l.isWellFormed)
      ? 1
      : 0,
    'Fix empty or malformed link targets.',
  );
  add(
    'links',
    'links_open_appropriately',
    'External links open in a new tab',
    1,
    externalLinks === 0
      ? 1
      : parsed.links.filter((l) => l.isExternal).every((l) => l.opensNewTab)
        ? 1
        : 0,
    'Open external links in a new tab.',
  );

  // ── Dimension 6: Media Optimization (10) ──
  const imageCount = parsed.images.length;
  const withAlt = parsed.images.filter((img) => img.alt.length > 0).length;
  const descriptiveNames = parsed.images.filter((img) =>
    hasDescriptiveFilename(img.src),
  ).length;
  const compressed = parsed.images.filter((img) =>
    /\.(webp|avif)(\?|#|$)/i.test(img.src),
  ).length;
  add(
    'media',
    'image_alt_text',
    'Images have descriptive alt text',
    3,
    imageCount === 0 ? 0 : bandScoreRatio(ratio(withAlt, imageCount), 3),
    imageCount === 0
      ? 'Add images with descriptive, keyword-aware alt text.'
      : 'Add alt text to all images.',
  );
  add(
    'media',
    'image_filenames',
    'Descriptive image file names',
    2,
    imageCount === 0
      ? 0
      : bandScoreRatio(ratio(descriptiveNames, imageCount), 2),
    'Use descriptive image file names (not IMG_1234.png).',
  );
  add(
    'media',
    'image_compression',
    'Images compressed (WebP/AVIF)',
    2,
    imageCount === 0 ? 0 : bandScoreRatio(ratio(compressed, imageCount), 2),
    'Serve images as WebP/AVIF for faster loads.',
  );
  add(
    'media',
    'video_embed',
    'Video embed present',
    2,
    parsed.hasVideoEmbed ? 2 : 0,
    'Embed a relevant video to increase dwell time.',
  );
  add(
    'media',
    'media_captions',
    'Captions/transcripts for media',
    1,
    !parsed.hasVideoEmbed ? 1 : parsed.hasCaptionTrack ? 1 : 0,
    'Provide captions or transcripts for embedded media.',
  );

  // ── Dimension 7: Technical Signals (10) ──
  add(
    'technicalSignals',
    'schema_markup',
    'Schema markup (JSON-LD) present',
    3,
    parsed.hasJsonLd ? 3 : 0,
    'Add JSON-LD schema markup appropriate to the content type.',
  );
  add(
    'technicalSignals',
    'mobile_friendly',
    'Mobile-friendly layout',
    3,
    0,
    'Mobile-friendliness requires a render environment to verify.',
    { available: false },
  );
  add(
    'technicalSignals',
    'page_speed',
    'Page speed considerations',
    2,
    0,
    'Page speed requires a render environment to verify.',
    { available: false },
  );
  const url = (input.url ?? '').trim();
  add(
    'technicalSignals',
    'https',
    'HTTPS',
    1,
    url.length === 0 ? 0 : /^https:\/\//i.test(url) ? 1 : 0,
    url.length === 0
      ? 'Provide the page URL to verify HTTPS.'
      : 'Serve the page over HTTPS.',
    { available: url.length > 0 },
  );
  add(
    'technicalSignals',
    'clean_html',
    'Clean HTML structure',
    1,
    parsed.headings.length > 0 && parsed.wordCount > 0 ? 1 : 0,
    'Use semantic HTML with a clear heading structure.',
  );

  return checks;
}

function bandScoreRatio(value: number, max: number): number {
  if (value >= 0.9) {
    return max;
  }
  if (value >= 0.6) {
    return Math.max(0, max - 1);
  }
  if (value >= 0.3) {
    return Math.max(0, max - 2);
  }
  return value > 0 ? Math.max(0, max - 3) : 0;
}

function scoreHeadingHierarchy(parsed: ParsedSeoHtml): number {
  if (parsed.headings.length === 0) {
    return 0;
  }
  let points = 5;
  if (parsed.h1Count !== 1) {
    points -= 2;
  }
  let previousLevel = 0;
  let skipped = false;
  for (const heading of parsed.headings) {
    if (previousLevel > 0 && heading.level > previousLevel + 1) {
      skipped = true;
    }
    previousLevel = heading.level;
  }
  if (skipped) {
    points -= 2;
  }
  return Math.max(0, points);
}

function scoreParagraphLength(paragraphs: string[]): number {
  if (paragraphs.length === 0) {
    return 0;
  }
  const maxSentences = paragraphs.reduce(
    (max, paragraph) => Math.max(max, splitSentences(paragraph).length),
    0,
  );
  if (maxSentences <= 3) {
    return 3;
  }
  if (maxSentences <= 4) {
    return 2;
  }
  if (maxSentences <= 6) {
    return 1;
  }
  return 0;
}

function heuristicFaqPresent(parsed: ParsedSeoHtml): boolean {
  const hasFaqHeading = parsed.headings.some(
    (h) =>
      h.text.toLowerCase().includes('faq') ||
      h.text.toLowerCase().includes('frequently asked'),
  );
  const questionHeadings = parsed.headings.filter((h) =>
    h.text.trim().endsWith('?'),
  ).length;
  return hasFaqHeading || questionHeadings >= 2;
}

function heuristicConclusionCta(paragraphs: string[]): boolean {
  if (paragraphs.length === 0) {
    return false;
  }
  const tail = paragraphs.slice(-2).join(' ').toLowerCase();
  return CTA_TERMS.some((term) => tail.includes(term));
}

function scoreActiveVoice(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 0;
  }
  const passivePattern = /\b(was|were|is|are|been|being|be)\b\s+\w+(ed|en)\b/i;
  const passive = sentences.filter((s) => passivePattern.test(s)).length;
  const activeRatio = 1 - ratio(passive, sentences.length);
  if (activeRatio >= 0.8) {
    return 3;
  }
  if (activeRatio >= 0.6) {
    return 2;
  }
  if (activeRatio >= 0.4) {
    return 1;
  }
  return 0;
}

function scoreSentenceVariance(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 2) {
    return sentences.length === 1 ? 1 : 0;
  }
  const lengths = sentences.map((s) => countWords(s));
  const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
  const stdev = Math.sqrt(variance);
  const hasShort = lengths.some((n) => n <= 12);
  const hasLong = lengths.some((n) => n >= 18);
  if (stdev >= 5 && hasShort && hasLong) {
    return 3;
  }
  if (stdev >= 3) {
    return 2;
  }
  return 1;
}

function scoreTransitionWords(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 0;
  }
  const withTransition = sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    return TRANSITION_WORDS.some((word) => lower.includes(word));
  }).length;
  const transitionRatio = ratio(withTransition, sentences.length);
  if (transitionRatio >= 0.3) {
    return 3;
  }
  if (transitionRatio >= 0.2) {
    return 2;
  }
  if (transitionRatio >= 0.1) {
    return 1;
  }
  return 0;
}

function scoreSlug(slug: string): number {
  if (!slug) {
    return 0;
  }
  const isHyphenated = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  if (!isHyphenated) {
    return 0;
  }
  const tokens = slug.split('-').filter(Boolean);
  const isDateOrIdHeavy = tokens.every((t) => /^\d+$/.test(t));
  if (isDateOrIdHeavy) {
    return 0;
  }
  if (tokens.length >= 3 && tokens.length <= 5) {
    return 3;
  }
  if (tokens.length === 2 || tokens.length === 6 || tokens.length === 7) {
    return 2;
  }
  return 1;
}

function hasDescriptiveFilename(src: string): boolean {
  if (!src) {
    return false;
  }
  const filename = (src.split('/').pop() ?? '').split(/[?#]/)[0];
  if (!filename) {
    return false;
  }
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  if (base.length < 4) {
    return false;
  }
  const genericPattern =
    /^(img|image|dsc|dscn|photo|screenshot|untitled|pic)[-_]?\d*$/i;
  const numericOnly = /^\d+$/;
  const hashLike = /^[a-f0-9]{16,}$/i;
  return (
    !genericPattern.test(base) &&
    !numericOnly.test(base) &&
    !hashLike.test(base)
  );
}

// ─── Assembly ────────────────────────────────────────────────────────────

function ratingFor(score: number): SeoRating {
  if (score >= 90) {
    return 'excellent';
  }
  if (score >= 75) {
    return 'good';
  }
  if (score >= 60) {
    return 'needs_work';
  }
  if (score >= 40) {
    return 'poor';
  }
  return 'critical';
}

/** Aggregate scored checks into a full scorecard. */
export function assembleScorecard(
  checks: SeoCheck[],
  meta: Omit<SeoScorecardMeta, 'maxAvailable'>,
): SeoScorecard {
  const breakdown = Object.fromEntries(
    (Object.keys(SEO_DIMENSION_MAX) as SeoDimension[]).map((d) => [d, 0]),
  ) as Record<SeoDimension, number>;

  let total = 0;
  let maxAvailable = 0;
  for (const check of checks) {
    breakdown[check.dimension] += check.points;
    total += check.points;
    if (check.available) {
      maxAvailable += check.max;
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(total)));

  const suggestions = checks
    .filter((check) => check.available && check.points < check.max)
    .sort((a, b) => {
      const lostB = b.max - b.points;
      const lostA = a.max - a.points;
      // Highest points-lost first; tie-break by larger dimension weight.
      return lostB - lostA || b.max - a.max;
    })
    .slice(0, 8)
    .map((check) => check.note);

  return {
    breakdown,
    checks,
    meta: { ...meta, maxAvailable },
    rating: ratingFor(score),
    score,
    suggestions,
  };
}
