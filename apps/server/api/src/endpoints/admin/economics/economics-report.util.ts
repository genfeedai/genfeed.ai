import { resolveCostReportRange } from '@api/endpoints/cost-reporting/cost-reporting-query.util';
import { ActivitySource } from '@genfeedai/contracts';
import { AGENT_CREDIT_USD } from '@genfeedai/contracts/constants';
import type {
  EconomicsOperation,
  IEconomicsDailyPoint,
  IEconomicsOperationCoverage,
  IEconomicsQuery,
  IEconomicsTotals,
} from '@genfeedai/contracts/interfaces';

const DAY_MS = 24 * 60 * 60 * 1000;
const MICROS_PER_USD = 1_000_000;
const MINOR_UNITS_PER_USD = 100;

export type NumericSqlValue = bigint | number | string | null;

/**
 * A reporting window of whole UTC days. SQL reads `[from, toExclusive)`;
 * `previous*` is the window of the same length right before it.
 */
export interface EconomicsWindow {
  days: number;
  from: Date;
  previousFrom: Date;
  toExclusive: Date;
}

export function toNumber(value: NumericSqlValue | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Day-aligns the query range; validation and defaults match cost reports. */
export function resolveEconomicsWindow(
  query: IEconomicsQuery,
  now: Date = new Date(),
): EconomicsWindow {
  const range = resolveCostReportRange(query, now);
  const from = startOfUtcDay(range.from);
  const lastDay = startOfUtcDay(range.to);
  const days = Math.round((lastDay.getTime() - from.getTime()) / DAY_MS) + 1;

  return {
    days,
    from,
    previousFrom: new Date(from.getTime() - days * DAY_MS),
    toExclusive: new Date(lastDay.getTime() + DAY_MS),
  };
}

export function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Every UTC day of the window, so charts show quiet days as zero. */
export function enumerateWindowDays(window: EconomicsWindow): string[] {
  return Array.from({ length: window.days }, (_, index) =>
    formatUtcDay(new Date(window.from.getTime() + index * DAY_MS)),
  );
}

export function microsToUsd(micros: number): number {
  return Number((micros / MICROS_PER_USD).toFixed(6));
}

export function minorToUsd(minor: number): number {
  return Number((minor / MINOR_UNITS_PER_USD).toFixed(2));
}

export function creditsToUsd(credits: number): number {
  return Number((credits * AGENT_CREDIT_USD).toFixed(6));
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function percentOf(part: number, whole: number): number | null {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : null;
}

/** One UTC day's raw ledger sums. */
export interface EconomicsDailyAggregate {
  creditsConsumed: number;
  llmCalls: number;
  llmCostMicros: number;
  mediaCostMicros: number;
  mediaGenerations: number;
  revenueEvents: number;
  revenueMinor: number;
}

export const EMPTY_ECONOMICS_DAILY_AGGREGATE: EconomicsDailyAggregate = {
  creditsConsumed: 0,
  llmCalls: 0,
  llmCostMicros: 0,
  mediaCostMicros: 0,
  mediaGenerations: 0,
  revenueEvents: 0,
  revenueMinor: 0,
};

export function sumDailyAggregates(
  aggregates: Iterable<EconomicsDailyAggregate>,
): EconomicsDailyAggregate {
  const total = { ...EMPTY_ECONOMICS_DAILY_AGGREGATE };
  for (const aggregate of aggregates) {
    total.creditsConsumed += aggregate.creditsConsumed;
    total.llmCalls += aggregate.llmCalls;
    total.llmCostMicros += aggregate.llmCostMicros;
    total.mediaCostMicros += aggregate.mediaCostMicros;
    total.mediaGenerations += aggregate.mediaGenerations;
    total.revenueEvents += aggregate.revenueEvents;
    total.revenueMinor += aggregate.revenueMinor;
  }
  return total;
}

/**
 * Totals re-derive both margins from summed money. The cash margin compares
 * Stripe revenue with provider cost; the pricing margin compares the retail
 * value of the credits spent with provider cost, so it still tells whether
 * the price list covers cost when nobody paid cash (free plans, grants).
 */
export function buildEconomicsTotals(
  aggregate: EconomicsDailyAggregate,
  organizations: { active: number; paying: number },
): IEconomicsTotals {
  const revenueUsd = minorToUsd(aggregate.revenueMinor);
  const llmCostUsd = microsToUsd(aggregate.llmCostMicros);
  const mediaCostUsd = microsToUsd(aggregate.mediaCostMicros);
  const providerCostUsd = roundUsd(llmCostUsd + mediaCostUsd);
  const creditsConsumed = roundUsd(aggregate.creditsConsumed);
  const creditValueUsd = creditsToUsd(aggregate.creditsConsumed);
  const grossMarginUsd = roundUsd(revenueUsd - providerCostUsd);
  const pricingMarginUsd = roundUsd(creditValueUsd - providerCostUsd);

  return {
    activeOrganizations: organizations.active,
    creditsConsumed,
    creditValueUsd,
    grossMarginPercent: percentOf(grossMarginUsd, revenueUsd),
    grossMarginUsd,
    llmCalls: aggregate.llmCalls,
    llmCostUsd,
    mediaCostUsd,
    mediaGenerations: aggregate.mediaGenerations,
    payingOrganizations: organizations.paying,
    pricingMarginPercent: percentOf(pricingMarginUsd, creditValueUsd),
    pricingMarginUsd,
    providerCostUsd,
    revenueEvents: aggregate.revenueEvents,
    revenueUsd,
  };
}

export function buildDailyPoints(
  days: readonly string[],
  byDay: ReadonlyMap<string, EconomicsDailyAggregate>,
): IEconomicsDailyPoint[] {
  return days.map((date) => {
    const aggregate = byDay.get(date) ?? EMPTY_ECONOMICS_DAILY_AGGREGATE;
    return {
      creditValueUsd: creditsToUsd(aggregate.creditsConsumed),
      date,
      llmCostUsd: microsToUsd(aggregate.llmCostMicros),
      mediaCostUsd: microsToUsd(aggregate.mediaCostMicros),
      revenueUsd: minorToUsd(aggregate.revenueMinor),
    };
  });
}

const OPERATION_BY_CREDIT_SOURCE: Record<string, EconomicsOperation> = {
  [ActivitySource.AGENT_CHAT]: 'agent_chat',
  [ActivitySource.AVATAR_GENERATION]: 'avatar',
  [ActivitySource.IMAGE_GENERATION]: 'image',
  [ActivitySource.IMAGE_REFRAME]: 'image',
  [ActivitySource.IMAGE_UPSCALE]: 'image',
  [ActivitySource.MUSIC_GENERATION]: 'music',
  [ActivitySource.VIDEO_GENERATION]: 'video',
  [ActivitySource.VIDEO_REFRAME]: 'video',
  [ActivitySource.VIDEO_UPSCALE]: 'video',
  [ActivitySource.VOICE_GENERATION]: 'voice',
};

const OPERATION_BY_MEDIA_CATEGORY: Record<string, EconomicsOperation> = {
  AUDIO: 'music',
  AVATAR: 'avatar',
  GIF: 'image',
  IMAGE: 'image',
  IMAGE_EDIT: 'image',
  MUSIC: 'music',
  VIDEO: 'video',
  VIDEO_EDIT: 'video',
  VOICE: 'voice',
};

export const ECONOMICS_OPERATIONS: readonly EconomicsOperation[] = [
  'agent_chat',
  'image',
  'video',
  'music',
  'voice',
  'avatar',
  'other',
];

export function operationForCreditSource(
  source: string | null,
): EconomicsOperation {
  return (source && OPERATION_BY_CREDIT_SOURCE[source]) || 'other';
}

export function operationForMediaCategory(
  category: string | null,
): EconomicsOperation {
  return (
    (category && OPERATION_BY_MEDIA_CATEGORY[category.toUpperCase()]) || 'other'
  );
}

export interface OperationCostInputs {
  /** Net credits spent, by the ledger row's `source`. */
  creditsBySource: ReadonlyArray<{ credits: number; source: string | null }>;
  /** LLM cost of agent-chat turns (rows carrying a thread). */
  llmChatCostMicros: number;
  /** LLM cost outside agent chat. */
  llmOtherCostMicros: number;
  /** Media cost by the generation's ingredient category. */
  mediaCostByCategory: ReadonlyArray<{
    category: string | null;
    costMicros: number;
  }>;
}

/**
 * Credits spent per operation next to the provider cost recorded for it. An
 * operation with credits but no recorded cost is a hole in the cost ledger,
 * not a free operation.
 */
export function buildOperationCoverage(
  inputs: OperationCostInputs,
): IEconomicsOperationCoverage[] {
  const credits = new Map<EconomicsOperation, number>();
  const costMicros = new Map<EconomicsOperation, number>();
  const add = (
    target: Map<EconomicsOperation, number>,
    key: EconomicsOperation,
    value: number,
  ) => target.set(key, (target.get(key) ?? 0) + value);

  for (const row of inputs.creditsBySource) {
    add(credits, operationForCreditSource(row.source), row.credits);
  }
  for (const row of inputs.mediaCostByCategory) {
    add(costMicros, operationForMediaCategory(row.category), row.costMicros);
  }
  add(costMicros, 'agent_chat', inputs.llmChatCostMicros);
  add(costMicros, 'other', inputs.llmOtherCostMicros);

  return ECONOMICS_OPERATIONS.map((operation) => {
    const spent = credits.get(operation) ?? 0;
    const costUsd = microsToUsd(costMicros.get(operation) ?? 0);
    const creditValueUsd = creditsToUsd(spent);
    return {
      costUsd,
      credits: roundUsd(spent),
      creditValueUsd,
      operation,
      pricingMarginUsd: roundUsd(creditValueUsd - costUsd),
      status: spent > 0 && costUsd === 0 ? 'missing' : 'tracked',
    };
  });
}
