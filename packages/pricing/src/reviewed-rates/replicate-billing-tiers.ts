import type {
  ProviderBillingUnit,
  ReviewedProviderRate,
  ReviewedVariantRule,
} from '@genfeedai/contracts/interfaces';
import {
  freezeReplicateVariantRule,
  variantCriterionSupported,
} from './replicate-variant-rule';
import {
  DERIVED_CRITERION_TITLES,
  REPLICATE_UNREACHABLE_BILLING_TIERS,
  REPLICATE_VARIANT_SELECTORS,
} from './replicate-variant-selectors';
import { variantOwn } from './variant-rule-validation';

function isJsonObject(value: unknown): value is Record<string, unknown> {
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
      variantRules?: ReviewedVariantRule[];
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
  if (!isJsonObject(value)) return null;
  const billingConfig = value.billingConfig;
  if (isJsonObject(billingConfig) && Array.isArray(billingConfig.current_tiers))
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
    if (isJsonObject(property) && typeof property.title === 'string')
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
  const options = isJsonObject(property) ? property.enum : undefined;
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
const METRIC_UNITS: ReadonlyMap<string, MetricUnit> = new Map<
  string,
  MetricUnit
>(
  Object.entries({
    audio_output_count: { unit: 'output' },
    audio_output_duration_seconds: { isPerOutput: true, unit: 'second' },
    character_input_count: { unit: 'character' },
    image_output_count: { unit: 'output' },
    // A flat price per prediction, billed once however many outputs it makes.
    run_count: { unit: 'request' },
    image_input_megapixel_count: { unit: 'input-megapixel' },
    token_input_count: { unit: 'input-token' },
    token_output_count: { unit: 'output-token' },
    video_output_count: { unit: 'output' },
    video_output_duration_seconds: { isPerOutput: true, unit: 'second' },
    image_output_megapixel_count: { isPerOutput: true, unit: 'megapixel' },
  }),
);

function mapMetric(metric: string): MetricUnit | null {
  return METRIC_UNITS.get(metric) ?? null;
}

function parsePrice(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : raw;
  if (typeof text !== 'string') return null;
  const match = /^\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*$/.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function billingDivisor(
  price: Record<string, unknown>,
  requiresScale: boolean,
): number | null {
  const text =
    `${String(price.type ?? '')} ${String(price.title ?? '')}`.toLowerCase();
  const scales = new Set<number>();
  for (const match of text.matchAll(
    /\bper[\s-]+(million|thousand|hundred|1m|1k|[0-9][0-9,]*)\b/g,
  )) {
    const scale = match[1];
    const divisor =
      scale === 'million' || scale === '1m'
        ? 1_000_000
        : scale === 'thousand' || scale === '1k'
          ? 1_000
          : scale === 'hundred'
            ? 100
            : Number(scale?.replace(/,/g, ''));
    if (!Number.isSafeInteger(divisor) || divisor <= 0) return null;
    scales.add(divisor);
  }
  if (scales.size > 1) return null;
  return scales.values().next().value ?? (requiresScale ? null : 1);
}

/**
 * Replicate states a numeric band as a one-sided range: `(-inf, N]` is
 * `open-closed` and `(N, +inf)` is `open`. Both read as a stable label that a
 * resolver entry maps a dispatched value onto; any other shape has no label.
 */
function rangeCriterionLabel(
  criterion: Record<string, unknown>,
): string | null {
  const { subtype, value } = criterion;
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [low, high] = value;
  if (low === null && subtype === 'open-closed' && Number.isFinite(high))
    return `up-to-${String(high)}`;
  if (high === null && subtype === 'open' && Number.isFinite(low))
    return `above-${String(low)}`;
  return null;
}

function mapBillingCriterion(
  criterion: Record<string, unknown>,
  properties: Record<string, unknown>,
  endpoint?: string,
  isResolverOnly = false,
):
  | {
      key: string;
      value: string | number | boolean;
      rule?: ReviewedVariantRule;
    }
  | { reason: string } {
  const title = String(criterion.title);
  // A band label is not an input value, so only a resolver entry may price it.
  const matched = isResolverOnly
    ? { reason: `unmapped_criterion:${title}` }
    : matchInputProperty(title, properties);
  if (!('reason' in matched)) {
    const value = coerceCriterionValue(
      matched.key,
      criterion.value,
      criterion.subtype,
      properties[matched.key],
    );
    return typeof value === 'object' ? value : { key: matched.key, value };
  }
  if (matched.reason.startsWith('ambiguous_')) return matched;
  const entry =
    endpoint && variantOwn(REPLICATE_VARIANT_SELECTORS, endpoint)
      ? REPLICATE_VARIANT_SELECTORS[endpoint]?.find(
          (candidate) => words(candidate.criterionTitle) === words(title),
        )
      : undefined;
  if (!entry)
    return DERIVED_CRITERION_TITLES.some(
      (derived) => words(derived) === words(title),
    )
      ? { reason: 'model variant needs a resolver entry' }
      : matched;
  const expected = criterion.subtype ?? typeof criterion.value;
  if (
    !['string', 'number', 'boolean'].includes(String(expected)) ||
    typeof criterion.value !== expected
  )
    return { reason: `unsupported_criterion_value:${entry.selectorKey}` };
  const rule = freezeReplicateVariantRule(entry, properties);
  if (!rule)
    return {
      reason: `Resolver field ${entry.derive.kind === 'composite' ? entry.derive.parts.map((part) => part.field).join('+') : entry.derive.field} does not match the provider input schema`,
    };
  if (!variantCriterionSupported(rule, criterion.value))
    return { reason: 'model variant needs a resolver entry' };
  return { key: rule.selectorKey, value: criterion.value, rule };
}

/**
 * Turn Replicate's `current_tiers[]` into reviewed rates. Every criterion must
 * map to exactly one input field and every price to a billed unit: anything
 * else fails the whole model, so a reviewed rate is never replaced by a guess.
 */
function isUnreachableTier(tier: unknown, endpoint?: string): boolean {
  const exclusions =
    endpoint && variantOwn(REPLICATE_UNREACHABLE_BILLING_TIERS, endpoint)
      ? REPLICATE_UNREACHABLE_BILLING_TIERS[endpoint]
      : undefined;
  if (!exclusions || !isJsonObject(tier) || !Array.isArray(tier.criteria))
    return false;
  return tier.criteria.some(
    (criterion) =>
      isJsonObject(criterion) &&
      typeof criterion.title === 'string' &&
      exclusions.some(
        (exclusion) =>
          words(exclusion.criterionTitle) === words(String(criterion.title)) &&
          exclusion.values.some((value) => value === criterion.value),
      ),
  );
}

/** A criterion every remaining tier leaves null does not distinguish them. */
function nullCriterionTitles(tiers: unknown[]): Set<string> {
  const titles = new Set<string>();
  const nonNull = new Set<string>();
  for (const tier of tiers) {
    if (!isJsonObject(tier) || !Array.isArray(tier.criteria)) continue;
    for (const criterion of tier.criteria) {
      if (!isJsonObject(criterion) || typeof criterion.title !== 'string')
        continue;
      const title = words(criterion.title);
      if (criterion.value === null && criterion.subtype === 'null')
        titles.add(title);
      else nonNull.add(title);
    }
  }
  for (const title of nonNull) titles.delete(title);
  return titles;
}

/**
 * A model variant every remaining tier names the same way is the model's only
 * variant (sora-2 once its own-key tier is dropped), so it picks no price and
 * needs no resolver entry. A second variant makes the values differ and fails
 * the mapping again until a resolver entry exists.
 */
function uniformModelVariantTitles(
  tiers: unknown[],
  endpoint?: string,
): Set<string> {
  const resolved =
    endpoint && variantOwn(REPLICATE_VARIANT_SELECTORS, endpoint)
      ? (REPLICATE_VARIANT_SELECTORS[endpoint] ?? [])
      : [];
  const valuesByTitle = new Map<string, Set<unknown>>();
  const tiersByTitle = new Map<string, number>();
  for (const tier of tiers) {
    if (!isJsonObject(tier) || !Array.isArray(tier.criteria)) continue;
    const titles = new Set<string>();
    for (const criterion of tier.criteria) {
      if (!isJsonObject(criterion) || typeof criterion.title !== 'string')
        continue;
      const title = words(criterion.title);
      titles.add(title);
      const values = valuesByTitle.get(title) ?? new Set<unknown>();
      values.add(
        `${String(criterion.type)}:${JSON.stringify(criterion.value)}`,
      );
      valuesByTitle.set(title, values);
    }
    for (const title of titles)
      tiersByTitle.set(title, (tiersByTitle.get(title) ?? 0) + 1);
  }
  const uniform = new Set<string>();
  for (const [title, values] of valuesByTitle)
    if (
      values.size === 1 &&
      tiersByTitle.get(title) === tiers.length &&
      title === 'model variant' &&
      !resolved.some((entry) => words(entry.criterionTitle) === title)
    )
      uniform.add(title);
  return uniform;
}

export function mapReplicateBillingTiers(
  allTiers: unknown[],
  inputProperties: Record<string, unknown>,
  endpoint?: string,
): ReplicateBillingMapping {
  const tiers = allTiers.filter((tier) => !isUnreachableTier(tier, endpoint));
  if (tiers.length === 0)
    return { reason: 'no_billing_tiers', status: 'failed' };
  const ignoredTitles = new Set([
    ...nullCriterionTitles(tiers),
    ...uniformModelVariantTitles(tiers, endpoint),
  ]);
  const rates: ReviewedProviderRate[] = [];
  const selectorKeys = new Set<string>();
  const variantRules = new Map<string, ReviewedVariantRule>();
  const seen = new Set<string>();
  for (const rawTier of tiers) {
    if (!isJsonObject(rawTier))
      return { reason: 'invalid_billing_tier', status: 'failed' };
    const criteria = Array.isArray(rawTier.criteria) ? rawTier.criteria : [];
    const prices = Array.isArray(rawTier.prices) ? rawTier.prices : [];
    if (prices.length === 0)
      return { reason: 'billing_tier_without_price', status: 'failed' };
    const when: Record<string, string | number | boolean> = {};
    for (const rawCriterion of criteria) {
      if (!isJsonObject(rawCriterion) || typeof rawCriterion.title !== 'string')
        return { reason: 'invalid_billing_criterion', status: 'failed' };
      if (ignoredTitles.has(words(rawCriterion.title))) continue;
      const isRange = rawCriterion.type === 'range';
      const rangeLabel = isRange ? rangeCriterionLabel(rawCriterion) : null;
      if (
        rawCriterion.type !== undefined &&
        rawCriterion.type !== 'equals' &&
        rangeLabel === null
      )
        return {
          reason: `unsupported_criterion_type:${String(rawCriterion.type)}`,
          status: 'failed',
        };
      const mapped = mapBillingCriterion(
        rangeLabel === null
          ? rawCriterion
          : { ...rawCriterion, subtype: 'string', value: rangeLabel },
        inputProperties,
        endpoint,
        rangeLabel !== null,
      );
      if ('reason' in mapped)
        return { reason: mapped.reason, status: 'failed' };
      if (mapped.key in when && when[mapped.key] !== mapped.value)
        return {
          reason: `conflicting_criterion:${mapped.key}`,
          status: 'failed',
        };
      when[mapped.key] = mapped.value;
      selectorKeys.add(mapped.key);
      if (mapped.rule) variantRules.set(mapped.rule.selectorKey, mapped.rule);
    }
    for (const rawPrice of prices) {
      if (!isJsonObject(rawPrice) || typeof rawPrice.metric !== 'string')
        return { reason: 'invalid_billing_price', status: 'failed' };
      const metric = mapMetric(rawPrice.metric);
      if (!metric)
        return {
          reason: `unmapped_metric:${rawPrice.metric}`,
          status: 'failed',
        };
      if (
        rawPrice.type !== undefined &&
        rawPrice.type !== (metric.unit === 'request' ? 'fixed' : 'per-unit') &&
        !metric.unit.endsWith('-token')
      )
        return {
          reason: `unsupported_price_type:${String(rawPrice.type)}`,
          status: 'failed',
        };
      const quoted = parsePrice(rawPrice.price);
      if (quoted === null)
        return { reason: `invalid_price:${rawPrice.metric}`, status: 'failed' };
      const isToken = metric.unit.endsWith('-token');
      const divisor = billingDivisor(rawPrice, isToken);
      if (divisor === null)
        return {
          reason: `${isToken ? 'unmapped_token_scale' : 'unmapped_price_scale'}:${rawPrice.metric}`,
          status: 'failed',
        };
      const unitPriceUsd = quoted / divisor;
      // Labelled by billed unit, as the rate sheet labels them, so the same
      // prices read as the same rates whichever source stated them.
      const component =
        metric.unit.endsWith('-token') ||
        metric.unit.startsWith('input-') ||
        metric.unit === 'request' ||
        metric.unit === 'character'
          ? metric.unit
          : 'output';
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
  return {
    rates,
    selectorKeys: [...selectorKeys].sort(),
    status: 'ok',
    ...(variantRules.size
      ? {
          variantRules: [...variantRules.values()].sort((left, right) =>
            left.selectorKey.localeCompare(right.selectorKey),
          ),
        }
      : {}),
  };
}
