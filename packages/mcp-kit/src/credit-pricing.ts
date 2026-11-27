/**
 * What one call costs. `fixed` is a set amount, `variable` a range per unit
 * of work, and `quote` the amount an earlier quote tool returned.
 */
export type ToolCreditPricing =
  | { amount: number; mode: 'fixed' }
  | { maximum: number; minimum: number; mode: 'variable'; unit: string }
  | { mode: 'quote'; quoteTool: string };

export function fixedCreditPricing(amount: number): ToolCreditPricing {
  return { amount, mode: 'fixed' };
}

/** Whether a call can spend credits, from its pricing or its minimum charge. */
export function isSpendingCreditPricing(
  pricing: ToolCreditPricing,
  creditCost: number,
): boolean {
  if (creditCost > 0) return true;
  if (pricing.mode === 'quote') return true;
  if (pricing.mode === 'variable') return pricing.maximum > 0;
  return pricing.amount > 0;
}

export function describeCreditPricing(pricing: ToolCreditPricing): string {
  if (pricing.mode === 'variable') {
    return `Variable cost: ${pricing.minimum}–${pricing.maximum} credits per ${pricing.unit}.`;
  }
  if (pricing.mode === 'quote') {
    return `Cost comes from the approved ${pricing.quoteTool} quote.`;
  }
  return pricing.amount === 0
    ? 'Costs 0 credits.'
    : `Costs ${pricing.amount} credits.`;
}

/** Adds the pricing sentence to a description, once, unless the price is fixed. */
export function appendCreditPricingDescription(
  description: string,
  pricing: ToolCreditPricing | undefined,
): string {
  if (!pricing || pricing.mode === 'fixed') return description;
  const sentence = describeCreditPricing(pricing);
  if (description.includes(sentence)) return description;
  return `${description} ${sentence}`;
}
