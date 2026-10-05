import { stableStringify } from '@genfeedai/contracts/constants/canonical-json.constant';
import {
  hashReviewedProviderRates,
  REVIEWED_RATE_HASH_PREFIX,
  sha256Hex,
} from '../reviewed-rate-hash';
import type { ReviewedRateSheetEntry } from './reviewed-rate-sheet.types';
import { parseReviewedVariantRules } from './variant-rule-validation';

/** Preserve rate-only identities; new frozen rules must not collide with a legacy row. */
export function hashReviewedRateSheetEntry(
  entry: Pick<ReviewedRateSheetEntry, 'rates' | 'variantRules'>,
): string {
  const rates = hashReviewedProviderRates(entry.rates);
  if (entry.variantRules === undefined) return rates;
  const parsed = parseReviewedVariantRules(entry.variantRules);
  if (!parsed) throw new RangeError('Reviewed variant rules are invalid');
  const variantRules = parsed
    .map((rule) => ({
      ...rule,
      derive:
        rule.derive.kind === 'composite'
          ? {
              ...rule.derive,
              cases: [...rule.derive.cases].sort((left, right) =>
                stableStringify(left.when).localeCompare(
                  stableStringify(right.when),
                ),
              ),
            }
          : rule.derive,
    }))
    .sort((left, right) => left.selectorKey.localeCompare(right.selectorKey));
  return `${REVIEWED_RATE_HASH_PREFIX}${sha256Hex(stableStringify({ rates, variantRules }))}`;
}
