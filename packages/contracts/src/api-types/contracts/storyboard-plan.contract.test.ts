import { describe, expect, it } from 'vitest';
import {
  type StoryboardPlan,
  type StoryboardSegment,
  storyboardPlanSchema,
} from './storyboard-plan.contract';

function segment(
  overrides: Partial<StoryboardSegment> = {},
): StoryboardSegment {
  return {
    cutaways: [],
    estimatedSeconds: 20,
    id: 'segment-1',
    narration: 'Here is the thing nobody tells you about pricing.',
    ordinal: 1,
    ...overrides,
  };
}

function longFormPlan(overrides: Partial<StoryboardPlan> = {}): StoryboardPlan {
  return {
    cast: [{ id: 'presenter', name: 'Presenter', referenceAssetIds: [] }],
    format: '16:9',
    logline: '',
    longForm: {
      presenterId: 'presenter',
      runtimeBudgetSeconds: 600,
      segments: [segment()],
    },
    runtimeBudgetSeconds: null,
    shots: [],
    styleReferenceAssetIds: [],
    title: 'Pricing',
    videoModelKey: null,
    ...overrides,
  };
}

function issuePaths(plan: unknown): string[] {
  const result = storyboardPlanSchema.safeParse(plan);
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('storyboardPlanSchema long form', () => {
  it('accepts a long-form plan with segments and a cutaway', () => {
    const plan = longFormPlan();
    plan.longForm?.segments[0]?.cutaways.push({
      brief: 'Bar chart of churn by month',
      durationSeconds: 6,
      id: 'cutaway-1',
      kind: 'motion_graphic',
      startSeconds: 4,
    });

    expect(storyboardPlanSchema.safeParse(plan).success).toBe(true);
  });

  it('rejects shots on a long-form plan', () => {
    expect(
      issuePaths(
        longFormPlan({
          shots: [
            {
              action: 'A hand lifts the product.',
              durationSeconds: 5,
              id: 'shot-1',
              onScreenSpeaker: false,
              ordinal: 1,
              stillFreshness: 'missing',
              transition: 'cut',
            },
          ],
        }),
      ),
    ).toContain('shots');
  });

  it('requires the presenter to be in the cast', () => {
    expect(issuePaths(longFormPlan({ cast: [] }))).toContain(
      'longForm.presenterId',
    );
  });

  it('keeps segment narration within the runtime budget', () => {
    const plan = longFormPlan();
    if (plan.longForm) plan.longForm.runtimeBudgetSeconds = 10;

    expect(issuePaths(plan)).toContain('longForm.segments');
  });

  it('rejects duplicate segment ids and out-of-order ordinals', () => {
    const plan = longFormPlan();
    if (plan.longForm)
      plan.longForm.segments = [segment(), segment({ ordinal: 3 })];

    const paths = issuePaths(plan);
    expect(paths).toContain('longForm.segments');
    expect(paths).toContain('longForm.segments.1.ordinal');
  });

  it('rejects a cutaway that starts after its segment ends', () => {
    const plan = longFormPlan();
    plan.longForm?.segments[0]?.cutaways.push({
      brief: 'Product close-up',
      durationSeconds: 3,
      id: 'cutaway-1',
      kind: 'still',
      startSeconds: 20,
    });

    expect(issuePaths(plan)).toContain('longForm.segments.0.cutaways.0');
  });

  it('leaves short plans without a long-form section valid', () => {
    expect(
      storyboardPlanSchema.safeParse(longFormPlan({ longForm: undefined }))
        .success,
    ).toBe(true);
  });
});
