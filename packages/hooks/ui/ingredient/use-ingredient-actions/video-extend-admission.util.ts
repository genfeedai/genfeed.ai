import { ModelCategory, PricingType } from '@genfeedai/contracts';
import { hasNativeExtend } from '@genfeedai/contracts/constants';
import type { IIngredient, IModel } from '@genfeedai/contracts/interfaces';
import { getModelCapability } from '@genfeedai/helpers/model-capability.helper';
import { quoteVideoExtensionCredits } from '@genfeedai/pricing';
import type { IngredientActionAvailability } from '@genfeedai/props/content/masonry.props';
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

function getVideoExtendCandidates(
  ingredient: IIngredient,
  models: readonly IModel[],
): VideoExtendModelOption[] {
  return [...models]
    .sort((left, right) => {
      if (left.key === ingredient.model) return -1;
      if (right.key === ingredient.model) return 1;
      return 0;
    })
    .flatMap((model) => {
      const capability = getModelCapability(model);
      if (
        capability?.category !== ModelCategory.VIDEO ||
        (!hasNativeExtend(model.key, capability) &&
          capability.maxReferences < 1)
      )
        return [];
      const option: VideoExtendModelOption = {
        cost: model.cost,
        costPerUnit: model.costPerUnit,
        defaultDuration: capability.defaultDuration,
        durations: capability.durations ? [...capability.durations] : undefined,
        key: model.key,
        label: model.label,
        minCost: model.minCost,
        pricingType: model.pricingType,
      };
      return [option];
    });
}

export function getVideoExtendModelOptions(
  ingredient: IIngredient,
  models: readonly IModel[],
): VideoExtendModelOption[] {
  return getVideoExtendCandidates(ingredient, models).filter((option) => {
    const duration = getVideoExtendDurationOptions(option)[0];
    return (
      duration !== undefined && getVideoExtendQuote(option, duration) !== null
    );
  });
}

export function getVideoExtendAvailability(
  ingredient: IIngredient,
  models: readonly IModel[],
): IngredientActionAvailability {
  if (getVideoExtendModelOptions(ingredient, models).length)
    return { isAvailable: true };
  return {
    isAvailable: false,
    reason: getVideoExtendCandidates(ingredient, models).length
      ? 'priceUnavailable'
      : 'modelUnavailable',
  };
}
