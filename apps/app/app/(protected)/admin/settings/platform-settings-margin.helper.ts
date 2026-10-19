import type { MarginInputMode } from '@genfeedai/contracts';
import {
  multiplierToPercent,
  percentToMultiplier,
  sellPriceForOneDollar,
} from '@genfeedai/pricing';

/** Percent an operator would type for a multiplier, in the given input mode. */
export function percentInputFor(
  multiplier: number,
  mode: MarginInputMode,
): string {
  return String(multiplierToPercent(multiplier, mode));
}

/**
 * True when the field's text is not simply the current committed multiplier
 * redisplayed in the current mode — i.e. the operator actually typed
 * something. Untouched fields are never re-parsed, so toggling the mode
 * selector (or saving without editing a field) can never round-trip a
 * multiplier through integer percent and drift it (e.g. 3.33 → "70%" →
 * 3.3333…). See issue #5172's "round-trips without silently changing the
 * stored multiplier" requirement.
 */
function isFieldDirty(
  text: string,
  committedMultiplier: number,
  mode: MarginInputMode,
): boolean {
  return text !== percentInputFor(committedMultiplier, mode);
}

/** Validate an operator-entered percent for the given mode, returning the resolved multiplier or an error. */
function resolvePercentInput(
  rawValue: string,
  mode: MarginInputMode,
): { error: string } | { multiplier: number } {
  const parsed = Number.parseFloat(rawValue);
  if (!Number.isFinite(parsed)) {
    return { error: 'Enter a number' };
  }
  if (mode === 'MARGIN' && parsed >= 100) {
    return { error: 'Margin percent must be less than 100' };
  }
  if (mode === 'MARKUP' && parsed <= -100) {
    return { error: 'Markup percent must be greater than -100' };
  }
  return { multiplier: percentToMultiplier(parsed, mode) };
}

/**
 * Resolve a field to the multiplier it should submit as. An untouched field
 * (see `isFieldDirty`) always resolves to its committed multiplier verbatim,
 * never a re-parsed value — that is what makes an uninvolved field immune to
 * percent-rounding drift.
 */
export function resolveFieldMultiplier(
  text: string,
  mode: MarginInputMode,
  committedMultiplier: number,
): { error: string } | { multiplier: number } {
  if (!isFieldDirty(text, committedMultiplier, mode)) {
    return { multiplier: committedMultiplier };
  }
  return resolvePercentInput(text, mode);
}

/** Live multiplier for the readout below a field: the edited value while typing, else the committed one. */
export function liveMultiplierFor(
  text: string,
  mode: MarginInputMode,
  committedMultiplier: number,
): number {
  const resolved = resolveFieldMultiplier(text, mode, committedMultiplier);
  return 'multiplier' in resolved ? resolved.multiplier : committedMultiplier;
}

/**
 * Live readout under a margin field, e.g.
 * "$1.00 provider → $3.33 sell · 70% margin · 233% markup". Shows both
 * framings regardless of the selected input mode, so switching modes never
 * hides where the other number came from.
 */
export function marginReadout(multiplier: number): string {
  const sellPrice = sellPriceForOneDollar(multiplier);
  const markupPercent = multiplierToPercent(multiplier, 'MARKUP');
  const marginPercent = multiplierToPercent(multiplier, 'MARGIN');
  return `$1.00 provider → $${sellPrice.toFixed(2)} sell · ${marginPercent}% margin · ${markupPercent}% markup`;
}
