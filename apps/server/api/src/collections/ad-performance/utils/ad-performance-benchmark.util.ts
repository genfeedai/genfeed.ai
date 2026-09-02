export type AdPerformanceBenchmarkFields = {
  headlineText: string | null;
  ctaText: string | null;
  adPlatform: string | null;
  industry: string | null;
  scope: string | null;
  spend: number | null;
  ctr: number | null;
  roas: number | null;
  cpc: number | null;
  cpa: number | null;
  performanceScore: number | null;
  conversionRate: number | null;
  dataConfidence: number | null;
  spendBucket: string | null;
  headlinePatternCategories: string[];
  ctaPatternCategories: string[];
};

export const HEADLINE_PATTERN_CATEGORIES: Record<string, RegExp> = {
  'benefit-focused': /\b(get|save|earn|boost|improve|increase)\b/i,
  comparison: /\b(vs\.?|versus|compared|better than|unlike)\b/i,
  'curiosity-gap': /\b(secret|surprising|you won't believe|revealed)\b/i,
  'how-to': /^how\s+to\b/i,
  'number-driven': /\b\d+\b/,
  'question-based': /\?$/,
  testimonial: /\b(review|rated|trusted|customers say)\b/i,
  urgency: /\b(limited|now|today|hurry|last chance|don't miss|ends|expires)\b/i,
};

export const CTA_PATTERN_CATEGORIES: Record<string, RegExp> = {
  'book-now': /\b(book|reserve|schedule)\b/i,
  'contact-us': /\b(contact|call|reach out|get in touch)\b/i,
  download: /\b(download|install|get the app)\b/i,
  'get-started': /\b(get started|start|begin|try)\b/i,
  'learn-more': /\b(learn more|find out|discover|explore)\b/i,
  'shop-now': /\b(shop|buy|order|purchase)\b/i,
  'sign-up': /\b(sign up|register|join|subscribe|create account)\b/i,
  'try-free': /\b(free trial|try free|start free|no cost)\b/i,
};

export const SPEND_BUCKETS = [
  { label: '$0-50/day', min: 0, max: 50 },
  { label: '$50-200/day', min: 50, max: 200 },
  { label: '$200-500/day', min: 200, max: 500 },
  { label: '$500-1000/day', min: 500, max: 1000 },
  { label: '$1000+/day', min: 1000, max: Infinity },
] as const;

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const collectMatchingCategories = (
  value: string | undefined,
  patterns: Record<string, RegExp>,
): string[] => {
  if (!value) return [];

  return Object.entries(patterns)
    .filter(([, regex]) => regex.test(value))
    .map(([category]) => category);
};

const resolveSpendBucket = (spend: number | undefined): string | undefined => {
  if (spend == null || spend <= 0) return undefined;

  return SPEND_BUCKETS.find(
    (bucket) => spend >= bucket.min && spend < bucket.max,
  )?.label;
};

export const buildAdPerformanceBenchmarkFields = (
  data: Record<string, unknown>,
): AdPerformanceBenchmarkFields => {
  const headlineText = readString(data.headlineText);
  const ctaText = readString(data.ctaText);
  const spend = readNumber(data.spend);

  return {
    adPlatform: readString(data.adPlatform) ?? null,
    conversionRate: readNumber(data.conversionRate) ?? null,
    cpa: readNumber(data.cpa) ?? null,
    cpc: readNumber(data.cpc) ?? null,
    ctaPatternCategories: collectMatchingCategories(
      ctaText,
      CTA_PATTERN_CATEGORIES,
    ),
    ctaText: ctaText ?? null,
    ctr: readNumber(data.ctr) ?? null,
    dataConfidence: readNumber(data.dataConfidence) ?? null,
    headlinePatternCategories: collectMatchingCategories(
      headlineText,
      HEADLINE_PATTERN_CATEGORIES,
    ),
    headlineText: headlineText ?? null,
    industry: readString(data.industry) ?? null,
    performanceScore: readNumber(data.performanceScore) ?? null,
    roas: readNumber(data.roas) ?? null,
    scope: readString(data.scope) ?? null,
    spend: spend ?? null,
    spendBucket: resolveSpendBucket(spend) ?? null,
  };
};
