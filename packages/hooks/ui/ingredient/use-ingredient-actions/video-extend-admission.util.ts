import { PricingType } from '@genfeedai/contracts';
import { hasNativeExtend } from '@genfeedai/contracts/constants';
import { quoteVideoExtensionCredits } from '@genfeedai/pricing';
import type { VideoExtendModelOption } from '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';

function isKnownPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function getVideoExtendDurationOptions(
  model: VideoExtendModelOption,
): readonly number[] {
  const durations = model.durations;
  if (
    !durations?.length ||
    !durations.every(
      (duration) =>
        Number.isInteger(duration) && duration >= 1 && duration <= 30,
    )
  )
    return [];
  return [...new Set(durations)];
}

export function getVideoExtendQuote(
  model: VideoExtendModelOption,
  duration: number,
): number | null {
  if (
    !getVideoExtendDurationOptions(model).includes(duration) ||
    !isKnownPrice(model.cost) ||
    (model.minCost !== undefined && !isKnownPrice(model.minCost)) ||
    (model.pricingType !== undefined &&
      model.pricingType !== PricingType.FLAT &&
      model.pricingType !== PricingType.PER_REQUEST &&
      model.pricingType !== PricingType.PER_SECOND) ||
    (model.pricingType === PricingType.PER_SECOND &&
      !isKnownPrice(model.costPerUnit))
  )
    return null;
  const quote = quoteVideoExtensionCredits({
    cost: model.cost,
    costPerUnit: model.costPerUnit,
    dispatchMode: hasNativeExtend(model.key) ? 'native' : 'fabricated',
    duration,
    minCost: model.minCost,
    modelKey: model.key,
    pricingType: model.pricingType,
  });
  return isKnownPrice(quote) ? quote : null;
}
