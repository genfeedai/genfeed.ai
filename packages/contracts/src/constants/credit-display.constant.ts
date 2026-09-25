/**
 * The one place credit amounts are turned into display strings. The ledger
 * keeps full precision (agent rounds settle fractional credits); every surface
 * — balance chips, transaction lists, agent message cost, model pickers —
 * formats through these helpers so no screen shows a long decimal.
 *
 * - Balance: whole credits rounded *down* (never show credits the org does not
 *   have) with thousands separators. From {@link CREDIT_BALANCE_COMPACT_THRESHOLD}
 *   up the chip form is compact ("124k", "1.2M"), also rounded down; pair it
 *   with {@link formatCreditBalanceExact} in a title/tooltip.
 * - Cost (per message, per turn, transaction rows): one decimal at most,
 *   "<0.1" below 0.1 and "Free" for zero.
 */

/** Balances at or above this switch to the compact form in chips. */
export const CREDIT_BALANCE_COMPACT_THRESHOLD = 100_000;

/** Smallest cost rendered as a number; anything above zero but below is "<0.1". */
export const CREDIT_COST_DISPLAY_MIN = 0.1;

export const CREDIT_COST_FREE_LABEL = 'Free';

const WHOLE_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const ONE_DECIMAL_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

const COMPACT_UNITS: ReadonlyArray<{ divisor: number; suffix: string }> = [
  { divisor: 1_000_000_000, suffix: 'B' },
  { divisor: 1_000_000, suffix: 'M' },
  { divisor: 1_000, suffix: 'k' },
];

export interface CreditCostFormatOptions {
  /** Appended after a numeric cost ("1.5 credits"). Never after "Free". */
  unit?: string;
}

function toFiniteNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Floor to `digits` decimals without float noise (1.2999999 → 1.2). */
function floorTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.floor(Number((value * factor).toFixed(6))) / factor;
}

/** Exact whole-credit balance, rounded down: 4900.97 → "4,900". */
export function formatCreditBalanceExact(
  value: number | null | undefined,
): string {
  return WHOLE_NUMBER_FORMATTER.format(Math.floor(toFiniteNumber(value)));
}

/**
 * Balance for chips and headers: "4,900" below 100k, compact and rounded down
 * above it ("124k", "1.2M"). Show {@link formatCreditBalanceExact} alongside
 * (title/tooltip) whenever {@link isCompactCreditBalance} is true.
 */
export function formatCreditBalance(value: number | null | undefined): string {
  const whole = Math.floor(toFiniteNumber(value));
  if (Math.abs(whole) < CREDIT_BALANCE_COMPACT_THRESHOLD) {
    return WHOLE_NUMBER_FORMATTER.format(whole);
  }

  const magnitude = Math.abs(whole);
  const sign = whole < 0 ? '-' : '';
  const unit =
    COMPACT_UNITS.find((candidate) => magnitude >= candidate.divisor) ??
    COMPACT_UNITS[COMPACT_UNITS.length - 1];
  // Thousands stay whole ("124k"); millions and up keep one decimal ("1.2M").
  const digits = unit.suffix === 'k' ? 0 : 1;
  const scaled = floorTo(magnitude / unit.divisor, digits);

  return `${sign}${ONE_DECIMAL_FORMATTER.format(scaled)}${unit.suffix}`;
}

/** Whether {@link formatCreditBalance} abbreviates this value. */
export function isCompactCreditBalance(
  value: number | null | undefined,
): boolean {
  return (
    Math.abs(Math.floor(toFiniteNumber(value))) >=
    CREDIT_BALANCE_COMPACT_THRESHOLD
  );
}

/**
 * Cost of a message, turn, or ledger row: "Free", "<0.1", "0.4", "12.5",
 * "1,250". Negative inputs (refund rows) keep their sign.
 */
export function formatCreditCost(
  value: number | null | undefined,
  options: CreditCostFormatOptions = {},
): string {
  const amount = toFiniteNumber(value);
  if (amount === 0) {
    return CREDIT_COST_FREE_LABEL;
  }

  const magnitude = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  const rounded = Math.round(magnitude * 10) / 10;
  const number =
    magnitude < CREDIT_COST_DISPLAY_MIN || rounded === 0
      ? `<${CREDIT_COST_DISPLAY_MIN}`
      : ONE_DECIMAL_FORMATTER.format(rounded);
  const label = `${sign}${number}`;

  return options.unit ? `${label} ${options.unit}` : label;
}

/** "≈ 0.2 credits / message" style estimate for model pickers. */
export function formatCreditCostEstimate(
  value: number | null | undefined,
  options: CreditCostFormatOptions = {},
): string {
  const label = formatCreditCost(value, options);
  return label === CREDIT_COST_FREE_LABEL ? label : `≈ ${label}`;
}
