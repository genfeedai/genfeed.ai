/**
 * Platform-wide operator toggle (#5172) for how the two margin knobs in
 * `/admin` → Platform settings are typed and read: as a markup percent on
 * provider cost, or a margin percent on sell price. Values match Prisma
 * `MarginInputMode` exactly.
 *
 * It is purely a display/input convention — it never changes what is stored
 * or billed. `PlatformSetting.marginMultiplierGeneration` and
 * `.marginMultiplierAgentChat` are always a sell/cost multiplier, and billing
 * always applies `cost × multiplier`. See `multiplierToPercent` /
 * `percentToMultiplier` in `@genfeedai/pricing`.
 *
 * @see packages/prisma/prisma/schema.prisma `enum MarginInputMode`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const MarginInputMode = {
  MARGIN: 'MARGIN',
  MARKUP: 'MARKUP',
} as const;

export type MarginInputMode =
  (typeof MarginInputMode)[keyof typeof MarginInputMode];

/** Every valid input mode, for validation and the admin select. */
export const MARGIN_INPUT_MODES = Object.values(MarginInputMode);

/** Operator-facing labels for the admin select. */
export const MARGIN_INPUT_MODE_LABELS: Record<MarginInputMode, string> = {
  [MarginInputMode.MARGIN]: 'Margin % (of sell price)',
  [MarginInputMode.MARKUP]: 'Markup % (on provider cost)',
};

/**
 * What a deployment gets before an operator touches anything: the margin
 * framing already used throughout this codebase's pricing docs and
 * `BASE_MARGIN_PERCENT`.
 */
export const DEFAULT_MARGIN_INPUT_MODE: MarginInputMode =
  MarginInputMode.MARGIN;

/**
 * Narrow a persisted value to a margin input mode.
 *
 * Fails closed to the default: a row written by a newer deployment, or
 * corrupted by hand, must never resolve to an input mode this process does
 * not recognise.
 */
export function parseMarginInputMode(value: unknown): MarginInputMode {
  return typeof value === 'string' &&
    (MARGIN_INPUT_MODES as string[]).includes(value)
    ? (value as MarginInputMode)
    : DEFAULT_MARGIN_INPUT_MODE;
}
