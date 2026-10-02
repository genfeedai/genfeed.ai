import { multiplyDecimalPricing } from './decimal-pricing';

/** Provider receipts and configured exchange rates use plain decimal strings. */
export function normalizeCrunCredits(value: string): string | null {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const decimal = fraction.replace(/0+$/, '');
  return `${whole.replace(/^0+(?=\d)/, '')}${decimal ? `.${decimal}` : ''}`;
}

export function crunCreditsEqual(left: string, right: string): boolean {
  const normalized = normalizeCrunCredits(left);
  return normalized !== null && normalized === normalizeCrunCredits(right);
}

export function crunCreditsToUsd(
  credits: string,
  creditsPerUsd: string,
): number | null {
  const amount = normalizeCrunCredits(credits);
  const rate = normalizeCrunCredits(creditsPerUsd);
  if (amount === null || rate === null || Number(rate) <= 0) return null;
  const result = Number(amount) / Number(rate);
  return Number.isFinite(result) &&
    result >= 0 &&
    (result > 0 || amount === '0')
    ? result
    : null;
}

export function crunCreditTotal(
  creditsPerTask: string,
  outputs: number,
): string | null {
  const normalized = normalizeCrunCredits(creditsPerTask);
  if (
    normalized === null ||
    !Number.isSafeInteger(outputs) ||
    outputs < 1 ||
    outputs > 4
  )
    return null;
  const result = multiplyDecimalPricing(Number(normalized), outputs);
  return Number.isFinite(result) ? String(result) : null;
}

/** Round an authenticated final receipt to micro-USD once, with exact decimal division. */
export function crunCreditsToMicros(
  credits: string,
  creditsPerUsd: string,
): number | null {
  const amount = normalizeCrunCredits(credits);
  const rate = normalizeCrunCredits(creditsPerUsd);
  if (amount === null || rate === null || rate === '0') return null;
  const [amountWhole, amountFraction = ''] = amount.split('.');
  const [rateWhole, rateFraction = ''] = rate.split('.');
  const numerator =
    BigInt(`${amountWhole}${amountFraction}`) *
    1000000n *
    10n ** BigInt(rateFraction.length);
  const denominator =
    BigInt(`${rateWhole}${rateFraction}`) *
    10n ** BigInt(amountFraction.length);
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  const result = Number(rounded);
  return Number.isSafeInteger(result) ? result : null;
}
