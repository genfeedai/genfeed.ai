import type { IEconomicsTotals } from '@genfeedai/contracts/interfaces';

export const ECONOMICS_PERIOD_DAYS = [7, 30, 90, 365] as const;

export const DEFAULT_ECONOMICS_PERIOD_DAYS = '30';

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

const SMALL_USD_FORMATTER = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 4,
  minimumFractionDigits: 2,
  style: 'currency',
});

const COUNT_FORMATTER = new Intl.NumberFormat('en-US');

/** Provider costs are often fractions of a cent; keep them readable. */
export function formatUsd(value: number): string {
  return Math.abs(value) > 0 && Math.abs(value) < 1
    ? SMALL_USD_FORMATTER.format(value)
    : USD_FORMATTER.format(value);
}

/** Axis ticks: whole dollars once values are large, cents below that. */
export function formatUsdAxis(value: number): string {
  return Math.abs(value) >= 10
    ? `$${COUNT_FORMATTER.format(Math.round(value))}`
    : USD_FORMATTER.format(value);
}

export function formatCount(value: number): string {
  return COUNT_FORMATTER.format(value);
}

export function formatMarginPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/**
 * Percent change against the previous period. Undefined without a previous
 * value to compare, so the card hides the trend instead of showing infinity.
 */
export function percentChange(
  current: number,
  previous: number,
): number | undefined {
  if (previous === 0) {
    return undefined;
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Inclusive UTC day range ending today. */
export function buildEconomicsRange(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  const from = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: toDateOnly(from), to: toDateOnly(now) };
}

export function formatLedgerTimestamp(value: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toISOString().slice(0, 16).replace('T', ' ');
}

/** Placeholder totals while a report loads, so cards keep their labels. */
export const EMPTY_ECONOMICS_TOTALS: IEconomicsTotals = {
  activeOrganizations: 0,
  creditsConsumed: 0,
  creditValueUsd: 0,
  grossMarginPercent: null,
  grossMarginUsd: 0,
  llmCalls: 0,
  llmCostUsd: 0,
  mediaCostUsd: 0,
  mediaGenerations: 0,
  payingOrganizations: 0,
  pricingMarginPercent: null,
  pricingMarginUsd: 0,
  providerCostUsd: 0,
  revenueEvents: 0,
  revenueUsd: 0,
};
