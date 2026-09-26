/**
 * Margin ⇄ multiplier ⇄ markup conversions (#5172).
 *
 * `PlatformSetting.marginMultiplierGeneration` and
 * `.marginMultiplierAgentChat` are always stored and applied as a sell/cost
 * multiplier (`cost × multiplier`) — never a second formula. The operator's
 * `PlatformSetting.marginInputMode` only changes how a multiplier is *typed
 * and read* in `/admin`: as a markup percent on provider cost, or a margin
 * percent on sell price. These helpers are the one place that math happens,
 * so the admin form and the live readout can never disagree.
 *
 *   markup% = (multiplier − 1) × 100      e.g. 3.33 → 233%
 *   margin% = (1 − 1 / multiplier) × 100  e.g. 3.33 → 70%
 */

import type { MarginInputMode } from '@genfeedai/contracts';

import { normalizeMarginMultiplier } from './plans-pricing';

/** Multiplier used when a candidate value has no sane interpretation. */
const NEUTRAL_MULTIPLIER = 1;

/** Markup% on provider cost. 1.0× → 0%, 3.33× → 233%. Invalid input → 0%. */
export function multiplierToMarkupPercent(multiplier: number): number {
  const safe = normalizeMarginMultiplier(multiplier, NEUTRAL_MULTIPLIER);
  return Math.round((safe - 1) * 100);
}

/** Margin% on sell price. 1.0× → 0%, 3.33× → ~70%. Invalid input → 0%. */
export function multiplierToMarginPercent(multiplier: number): number {
  const safe = normalizeMarginMultiplier(multiplier, NEUTRAL_MULTIPLIER);
  return Math.round((1 - 1 / safe) * 100);
}

/**
 * Multiplier from an operator-entered markup percent (e.g. 233 → 3.33×).
 * A markup at or below -100% cannot resolve to a positive multiplier and
 * falls back to 1× (no markup), same as any other invalid input.
 */
export function multiplierFromMarkupPercent(markupPercent: number): number {
  if (!Number.isFinite(markupPercent) || markupPercent <= -100) {
    return NEUTRAL_MULTIPLIER;
  }
  return normalizeMarginMultiplier(1 + markupPercent / 100, NEUTRAL_MULTIPLIER);
}

/**
 * Multiplier from an operator-entered margin percent (e.g. 70 → 3.33×).
 * A margin at or above 100% implies an infinite multiplier (sell price is
 * entirely markup, cost is zero) and falls back to 1×, same as any other
 * invalid input.
 */
export function multiplierFromMarginPercent(marginPercent: number): number {
  if (!Number.isFinite(marginPercent) || marginPercent >= 100) {
    return NEUTRAL_MULTIPLIER;
  }
  return normalizeMarginMultiplier(
    1 / (1 - marginPercent / 100),
    NEUTRAL_MULTIPLIER,
  );
}

/** Read a multiplier as the percent an operator would see in the given input mode. */
export function multiplierToPercent(
  multiplier: number,
  mode: MarginInputMode,
): number {
  return mode === 'MARKUP'
    ? multiplierToMarkupPercent(multiplier)
    : multiplierToMarginPercent(multiplier);
}

/** Resolve an operator-entered percent (in the given input mode) to a multiplier. */
export function percentToMultiplier(
  percent: number,
  mode: MarginInputMode,
): number {
  return mode === 'MARKUP'
    ? multiplierFromMarkupPercent(percent)
    : multiplierFromMarginPercent(percent);
}

/** Sell price in USD for $1.00 of provider cost at the given multiplier. */
export function sellPriceForOneDollar(multiplier: number): number {
  return normalizeMarginMultiplier(multiplier, NEUTRAL_MULTIPLIER);
}
