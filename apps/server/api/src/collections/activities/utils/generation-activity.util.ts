import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  getActivityRouting,
  getFailureActivityRouting,
} from '@api/helpers/utils/activity-routing/activity-routing.util';
import {
  buildCompletionValue,
  buildFailureValue,
  parseActivityValue,
} from '@api/helpers/utils/activity-value/activity-value.util';
import { IngredientStatus, parseActivityKey } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';

type GenerationIngredient = Prisma.IngredientGetPayload<{
  include: { metadata: true };
}>;

/** Reconcile missed legacy events from persisted output, without rewriting history. */
export function hydrateGenerationActivity(
  activity: ActivityDocument,
  ingredient: GenerationIngredient,
): ActivityDocument {
  const { operation, lifecycle } = parseActivityKey(activity.key ?? '');
  const routing = getActivityRouting({
    category: ingredient.category,
    isReframe: operation === 'reframe',
    isUpscale: operation === 'upscale',
    metadataExtension: ingredient.metadata?.extension,
  });
  if (!routing) return activity;
  const existingValue = parseActivityValue(activity.value ?? undefined);
  const value = {
    ...existingValue,
    startedAt: existingValue.startedAt ?? activity.createdAt.toISOString(),
  };
  if (
    ingredient.status === IngredientStatus.GENERATED ||
    ingredient.status === IngredientStatus.VALIDATED
  ) {
    return {
      ...activity,
      ingredient,
      key: routing.activityKey,
      value: buildCompletionValue({
        activityKey: routing.activityKey,
        ingredientId: ingredient.id,
        existingValue: {
          ...value,
          completedAt:
            existingValue.completedAt ??
            (lifecycle === 'completed'
              ? activity.updatedAt
              : (ingredient.metadata?.updatedAt ?? ingredient.updatedAt)
            ).toISOString(),
        },
      }),
    };
  }
  if (
    ingredient.status === IngredientStatus.FAILED &&
    operation === 'generate'
  ) {
    const failure = getFailureActivityRouting(ingredient.category);
    if (failure)
      return {
        ...activity,
        ingredient,
        key: failure.activityKey,
        value: buildFailureValue({
          activityKey: failure.activityKey,
          ingredientId: ingredient.id,
          errorMessage:
            ingredient.generationError ??
            ingredient.metadata?.error ??
            undefined,
          existingValue: {
            ...value,
            completedAt:
              existingValue.completedAt ?? ingredient.updatedAt.toISOString(),
          },
        }),
      };
  }
  return { ...activity, ingredient, value: JSON.stringify(value) };
}
