import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { hydrateGenerationActivity } from '@api/collections/activities/utils/generation-activity.util';
import {
  ActivityKey,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const startedAt = new Date('2026-09-08T18:52:06Z');
const finishedAt = new Date('2026-09-08T18:52:19Z');
const activity = {
  id: 'activity-1',
  entityId: 'image-1',
  key: ActivityKey.IMAGE_PROCESSING,
  createdAt: startedAt,
  updatedAt: startedAt,
  organizationId: 'org-1',
  value: JSON.stringify({ ingredientId: 'image-1', credits: 12 }),
} as ActivityDocument;
const ingredient = {
  id: 'image-1',
  category: IngredientCategory.IMAGE,
  status: IngredientStatus.GENERATED,
  updatedAt: finishedAt,
  metadata: { updatedAt: finishedAt },
} as Parameters<typeof hydrateGenerationActivity>[1];

describe('generation activity lifecycle', () => {
  it('reconciles missed completion without adding a second row or changing history', () => {
    const hydrated = hydrateGenerationActivity(activity, ingredient);
    expect(hydrated.id).toBe(activity.id);
    expect(hydrated.key).toBe(ActivityKey.IMAGE_GENERATED);
    expect(hydrated.ingredient).toBe(ingredient);
    expect(JSON.parse(hydrated.value ?? '{}')).toMatchObject({
      ingredientId: 'image-1',
      credits: 12,
      startedAt: startedAt.toISOString(),
      completedAt: finishedAt.toISOString(),
    });
    expect(activity.key).toBe(ActivityKey.IMAGE_PROCESSING);
  });
  it('keeps a genuinely processing ingredient running', () => {
    expect(
      hydrateGenerationActivity(activity, {
        ...ingredient,
        status: IngredientStatus.PROCESSING,
      }).key,
    ).toBe(ActivityKey.IMAGE_PROCESSING);
  });
  it('shows a persisted failure and its reason on the original row', () => {
    const hydrated = hydrateGenerationActivity(activity, {
      ...ingredient,
      status: IngredientStatus.FAILED,
      generationError: 'Provider timed out',
    });
    expect(hydrated.key).toBe(ActivityKey.IMAGE_FAILED);
    expect(JSON.parse(hydrated.value ?? '{}')).toMatchObject({
      error: 'Provider timed out',
      completedAt: finishedAt.toISOString(),
    });
  });
  it('preserves the recorded finish when metadata is edited later', () => {
    const hydrated = hydrateGenerationActivity(
      { ...activity, key: ActivityKey.IMAGE_GENERATED, updatedAt: finishedAt },
      { ...ingredient, updatedAt: new Date() },
    );
    expect(JSON.parse(hydrated.value ?? '{}').completedAt).toBe(
      finishedAt.toISOString(),
    );
  });
});
