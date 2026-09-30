/** Exact arithmetic over the supplied finite decimal rate/quantity values. */
type DecimalRatio = { numerator: bigint; denominator: bigint };
function decimalRatio(value: number): DecimalRatio | null {
  if (!Number.isFinite(value)) return null;
  const [coefficient = '0', exponentText = '0'] = String(value)
    .toLowerCase()
    .split('e');
  const [whole = '0', fraction = ''] = coefficient.split('.');
  const scale = fraction.length - Number(exponentText);
  const digits = `${whole}${fraction}`;
  if (scale <= 0)
    return {
      numerator: BigInt(digits) * BigInt(`1${'0'.repeat(-scale)}`),
      denominator: BigInt(1),
    };
  return {
    numerator: BigInt(digits),
    denominator: BigInt(`1${'0'.repeat(scale)}`),
  };
}
function numberFromRatio(ratio: DecimalRatio): number {
  // Internal denominators are powers of ten. Parse one decimal rather than
  // converting large numerator/denominator values separately to Infinity.
  return Number(
    `${ratio.numerator}e-${ratio.denominator.toString().length - 1}`,
  );
}
export function multiplyDecimalPricing(...values: number[]): number {
  let result: DecimalRatio = { numerator: BigInt(1), denominator: BigInt(1) };
  for (const value of values) {
    const ratio = decimalRatio(value);
    if (!ratio) return NaN;
    result = {
      numerator: result.numerator * ratio.numerator,
      denominator: result.denominator * ratio.denominator,
    };
  }
  return numberFromRatio(result);
}
export function sumDecimalPricing(values: readonly number[]): number {
  let result: DecimalRatio = { numerator: BigInt(0), denominator: BigInt(1) };
  for (const value of values) {
    const ratio = decimalRatio(value);
    if (!ratio) return NaN;
    result = {
      numerator:
        result.numerator * ratio.denominator +
        ratio.numerator * result.denominator,
      denominator: result.denominator * ratio.denominator,
    };
  }
  return numberFromRatio(result);
}
export function ceilDecimalPricingRatio(
  numeratorFactors: readonly number[],
  divisor: number,
): number {
  let result: DecimalRatio = { numerator: BigInt(1), denominator: BigInt(1) };
  for (const value of numeratorFactors) {
    const ratio = decimalRatio(value);
    if (!ratio) return NaN;
    result = {
      numerator: result.numerator * ratio.numerator,
      denominator: result.denominator * ratio.denominator,
    };
  }
  const divisorRatio = decimalRatio(divisor);
  if (!divisorRatio || divisorRatio.numerator <= BigInt(0)) return NaN;
  const numerator = result.numerator * divisorRatio.denominator;
  const denominator = result.denominator * divisorRatio.numerator;
  const quotient = numerator / denominator;
  return Number(
    quotient + (numerator % denominator > BigInt(0) ? BigInt(1) : BigInt(0)),
  );
}
