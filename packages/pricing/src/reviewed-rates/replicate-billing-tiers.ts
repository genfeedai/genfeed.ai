import type {
  ProviderBillingUnit,
  ReviewedProviderRate,
} from '@genfeedai/contracts/interfaces';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** What the Replicate public model page said about billing. */
export type ReplicateBillingObservation =
  | { status: 'ok'; sourceUrl: string; tiers: unknown[] }
  | { status: 'unavailable'; reason: string };

export type ReplicateBillingMapping =
  | {
      status: 'ok';
      /** Selector keys the tiers price on. */
      selectorKeys: string[];
      rates: ReviewedProviderRate[];
    }
  | { status: 'failed'; reason: string };

const JSON_SCRIPT =
  /<script\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
const MAX_SEARCH_DEPTH = 14;

function findBillingTiers(value: unknown, depth = 0): unknown[] | null {
  if (depth > MAX_SEARCH_DEPTH) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBillingTiers(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  const billingConfig = value.billingConfig;
  if (isRecord(billingConfig) && Array.isArray(billingConfig.current_tiers))
    return billingConfig.current_tiers;
  for (const item of Object.values(value)) {
    const found = findBillingTiers(item, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The `billingConfig.current_tiers[]` embedded in a Replicate model page. */
export function extractReplicateBillingTiers(html: string): unknown[] | null {
  for (const match of html.matchAll(JSON_SCRIPT)) {
    const body = match[1];
    if (!body?.includes('billingConfig')) continue;
    try {
      const tiers = findBillingTiers(JSON.parse(body));
      if (tiers) return tiers;
    } catch {
      // Not the props script; keep looking.
    }
  }
  return null;
}

function words(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Billing criterion titles Replicate words differently from the input field. */
const CRITERION_ALIASES: Readonly<Record<string, string>> = {
  'duration in seconds': 'duration',
  'length of output video': 'duration',
  'output video duration': 'duration',
  'second of output video': 'duration',
  'seconds of output video': 'duration',
  'video duration': 'duration',
};

function matchInputProperty(
  title: string,
  properties: Record<string, unknown>,
): { key: string } | { reason: string } {
  const normalized = words(title);
  if (!normalized) return { reason: `unmapped_criterion:${title}` };
  const names = new Map<string, string[]>();
  for (const [key, property] of Object.entries(properties)) {
    const labels = [words(key)];
    if (isRecord(property) && typeof property.title === 'string')
      labels.push(words(property.title));
    names.set(key, labels);
  }
  const exact = [...names].filter(([, labels]) => labels.includes(normalized));
  if (exact.length === 1 && exact[0]) return { key: exact[0][0] };
  if (exact.length > 1) return { reason: `ambiguous_criterion:${title}` };
  const alias = CRITERION_ALIASES[normalized];
  if (alias && alias in properties) return { key: alias };
  const suffix = [...names].filter(([, labels]) =>
    labels.some((label) => label && normalized.endsWith(` ${label}`)),
  );
  if (suffix.length === 1 && suffix[0]) return { key: suffix[0][0] };
  return {
    reason: `${suffix.length > 1 ? 'ambiguous' : 'unmapped'}_criterion:${title}`,
  };
}

function coerceCriterionValue(
  key: string,
  raw: unknown,
  subtype: unknown,
  property: unknown,
): string | number | boolean | { reason: string } {
  const expected =
    subtype === 'number' || subtype === 'boolean' || subtype === 'string'
      ? subtype
      : typeof raw;
  if (
    typeof raw !== expected ||
    !['string', 'number', 'boolean'].includes(expected)
  )
    return { reason: `unsupported_criterion_value:${key}` };
  const value = raw as string | number | boolean;
  const options = isRecord(property) ? property.enum : undefined;
  if (!Array.isArray(options)) return value;
  const member = options.find(
    (option) =>
      option === value ||
      (typeof option === 'string' &&
        typeof value === 'string' &&
        option.toLowerCase() === value.toLowerCase()),
  );
  return member === undefined || typeof member === 'object'
    ? { reason: `value_not_in_schema:${key}=${String(value)}` }
    : (member as string | number | boolean);
}

interface MetricUnit {
  unit: ProviderBillingUnit;
  isPerOutput?: boolean;
}

/**
 * Exact Replicate metric names this mapper understands. Anything else (for
 * example `gpu_seconds`, or an unknown `*_seconds` / `*_megapixel*` name) fails
 * the mapping, so a rate is never read from a metric that bills something else.
 */
const METRIC_UNITS: Readonly<Record<string, MetricUnit>> = {
  audio_output_count: { unit: 'output' },
  image_output_count: { unit: 'output' },
  input_token_count: { unit: 'input-token' },
  output_token_count: { unit: 'output-token' },
  video_output_count: { unit: 'output' },
  video_output_duration_seconds: { isPerOutput: true, unit: 'second' },
  image_output_megapixel_count: { isPerOutput: true, unit: 'megapixel' },
};

function mapMetric(metric: string): MetricUnit | null {
  return Object.hasOwn(METRIC_UNITS, metric)
    ? (METRIC_UNITS[metric] ?? null)
    : null;
}

function parsePrice(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string') return null;
  const match = /^\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*$/.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function tokenDivisor(price: Record<string, unknown>): number | null {
  const text =
    `${String(price.type ?? '')} ${String(price.title ?? '')}`.toLowerCase();
  if (/million|1m\b/.test(text)) return 1_000_000;
  if (/thousand|1k\b/.test(text)) return 1_000;
  return null;
}

/**
 * Turn Replicate's `current_tiers[]` into reviewed rates. Every criterion must
 * map to exactly one input field and every price to a billed unit: anything
 * else fails the whole model, so a reviewed rate is never replaced by a guess.
 */
export function mapReplicateBillingTiers(
  tiers: unknown[],
  inputProperties: Record<string, unknown>,
): ReplicateBillingMapping {
  if (tiers.length === 0)
    return { reason: 'no_billing_tiers', status: 'failed' };
  const rates: ReviewedProviderRate[] = [];
  const selectorKeys = new Set<string>();
  const seen = new Set<string>();
  for (const rawTier of tiers) {
    if (!isRecord(rawTier))
      return { reason: 'invalid_billing_tier', status: 'failed' };
    const criteria = Array.isArray(rawTier.criteria) ? rawTier.criteria : [];
    const prices = Array.isArray(rawTier.prices) ? rawTier.prices : [];
    if (prices.length === 0)
      return { reason: 'billing_tier_without_price', status: 'failed' };
    const when: Record<string, string | number | boolean> = {};
    for (const rawCriterion of criteria) {
      if (!isRecord(rawCriterion) || typeof rawCriterion.title !== 'string')
        return { reason: 'invalid_billing_criterion', status: 'failed' };
      if (rawCriterion.type !== undefined && rawCriterion.type !== 'equals')
        return {
          reason: `unsupported_criterion_type:${String(rawCriterion.type)}`,
          status: 'failed',
        };
      const matched = matchInputProperty(rawCriterion.title, inputProperties);
      if ('reason' in matched)
        return { reason: matched.reason, status: 'failed' };
      const value = coerceCriterionValue(
        matched.key,
        rawCriterion.value,
        rawCriterion.subtype,
        inputProperties[matched.key],
      );
      if (typeof value === 'object')
        return { reason: value.reason, status: 'failed' };
      if (matched.key in when && when[matched.key] !== value)
        return {
          reason: `conflicting_criterion:${matched.key}`,
          status: 'failed',
        };
      when[matched.key] = value;
      selectorKeys.add(matched.key);
    }
    for (const rawPrice of prices) {
      if (!isRecord(rawPrice) || typeof rawPrice.metric !== 'string')
        return { reason: 'invalid_billing_price', status: 'failed' };
      const metric = mapMetric(rawPrice.metric);
      if (!metric)
        return {
          reason: `unmapped_metric:${rawPrice.metric}`,
          status: 'failed',
        };
      if (
        rawPrice.type !== undefined &&
        rawPrice.type !== 'per-unit' &&
        !metric.unit.endsWith('-token')
      )
        return {
          reason: `unsupported_price_type:${String(rawPrice.type)}`,
          status: 'failed',
        };
      const quoted = parsePrice(rawPrice.price);
      if (quoted === null)
        return { reason: `invalid_price:${rawPrice.metric}`, status: 'failed' };
      let unitPriceUsd = quoted;
      if (metric.unit.endsWith('-token')) {
        const divisor = tokenDivisor(rawPrice);
        if (divisor === null)
          return {
            reason: `unmapped_token_scale:${rawPrice.metric}`,
            status: 'failed',
          };
        unitPriceUsd = quoted / divisor;
      }
      // Labelled by billed unit, as the rate sheet labels them, so the same
      // prices read as the same rates whichever source stated them.
      const component = metric.unit.endsWith('-token') ? metric.unit : 'output';
      const identity = JSON.stringify([
        component,
        Object.entries(when).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ]);
      if (seen.has(identity))
        return {
          reason: `ambiguous_tiers:${rawPrice.metric}`,
          status: 'failed',
        };
      seen.add(identity);
      rates.push({
        component,
        unit: metric.unit,
        unitPriceUsd,
        when: { ...when },
        ...(metric.isPerOutput ? { isPerOutput: true } : {}),
      });
    }
  }
  return { rates, selectorKeys: [...selectorKeys].sort(), status: 'ok' };
}
