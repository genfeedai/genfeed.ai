import type { IModel } from '@genfeedai/interfaces';
import type {
  UsePromptBarPricingOptions,
  UsePromptBarPricingReturn,
} from '@props/studio/prompt-bar.props';
import { useCallback, useMemo } from 'react';

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_DURATION = 8;
const MEGAPIXEL_DIVISOR = 1_000_000;

function calculateCostWithMinimum(
  calculatedCost: number,
  minCost: number | undefined,
): number {
  return Math.max(Math.ceil(calculatedCost), minCost ?? 0);
}

export function usePromptBarPricing(
  options: UsePromptBarPricingOptions,
): UsePromptBarPricingReturn {
  const {
    selectedModels,
    watchedWidth,
    watchedHeight,
    watchedDuration,
    watchedOutputs,
  } = options;

  const calculateModelCost = useCallback(
    (
      model: IModel,
      width: number,
      height: number,
      duration: number,
    ): number => {
      const pricingType = model.pricingType ?? 'flat';
      const fallbackCost = model.cost ?? 0;

      switch (pricingType) {
        case 'per-megapixel': {
          if (!width || !height || !model.costPerUnit) {
            return fallbackCost;
          }
          const megapixels = (width * height) / MEGAPIXEL_DIVISOR;
          return calculateCostWithMinimum(
            megapixels * model.costPerUnit,
            model.minCost,
          );
        }

        case 'per-second': {
          if (!duration || !model.costPerUnit) {
            return fallbackCost;
          }
          return calculateCostWithMinimum(
            duration * model.costPerUnit,
            model.minCost,
          );
        }

        default:
          return fallbackCost;
      }
    },
    [],
  );

  const selectedModelCost = useMemo(() => {
    const totalBaseCost = selectedModels.reduce(
      (sum, model) =>
        sum +
        calculateModelCost(
          model,
          watchedWidth ?? DEFAULT_WIDTH,
          watchedHeight ?? DEFAULT_HEIGHT,
          watchedDuration ?? DEFAULT_DURATION,
        ),
      0,
    );

    return totalBaseCost * (watchedOutputs ?? 1);
  }, [
    selectedModels,
    watchedWidth,
    watchedHeight,
    watchedDuration,
    watchedOutputs,
    calculateModelCost,
  ]);

  return {
    calculateModelCost,
    selectedModelCost,
  };
}
