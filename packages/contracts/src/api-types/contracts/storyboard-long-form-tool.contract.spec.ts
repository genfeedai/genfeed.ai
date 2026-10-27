import { describe, expect, it } from 'vitest';
import {
  editStoryboardLongFormScript as editLongFormScript,
  startStoryboardLongFormToolSchema,
  storyboardLongFormToolSchema,
} from './storyboard-long-form-tool.contract';
import type { StoryboardPlan } from './storyboard-plan.contract';

function plan(): StoryboardPlan {
  return {
    cast: [{ id: 'presenter', name: 'Presenter', referenceAssetIds: [] }],
    format: '16:9',
    logline: '',
    longForm: {
      presenterId: 'presenter',
      runtimeBudgetSeconds: 600,
      segments: [
        {
          cutaways: [
            {
              assetId: 'still-1',
              brief: 'Bar chart of churn by month',
              durationSeconds: 4,
              id: 'cutaway-1',
              kind: 'still',
              startSeconds: 2,
            },
          ],
          estimatedSeconds: 20,
          id: 'segment-1',
          narration: 'Here is the thing nobody tells you about pricing.',
          ordinal: 1,
        },
      ],
    },
    runtimeBudgetSeconds: null,
    shots: [],
    styleReferenceAssetIds: [],
    title: 'Pricing',
    videoModelKey: null,
  };
}

describe('editLongFormScript', () => {
  it('rewrites narration and drops the still of a changed cutaway brief', () => {
    const edited = editLongFormScript(plan(), {
      segments: [{ id: 'segment-1', narration: 'Pricing is a story.' }],
      cutaways: [{ id: 'cutaway-1', brief: 'Line chart of revenue' }],
    });
    const segment = edited.longForm?.segments[0];
    expect(segment?.narration).toBe('Pricing is a story.');
    expect(segment?.cutaways[0]).toEqual({
      brief: 'Line chart of revenue',
      durationSeconds: 4,
      id: 'cutaway-1',
      kind: 'still',
      startSeconds: 2,
    });
  });

  it('keeps the still when the brief is unchanged', () => {
    const edited = editLongFormScript(plan(), {
      cutaways: [{ id: 'cutaway-1', brief: 'Bar chart of churn by month' }],
    });
    expect(edited.longForm?.segments[0]?.cutaways[0]?.assetId).toBe('still-1');
  });

  it('refuses unknown ids and short-form plans', () => {
    expect(() =>
      editLongFormScript(plan(), { segments: [{ id: 'missing' }] }),
    ).toThrow('Unknown segment or cutaway ids: missing');
    expect(() =>
      editLongFormScript({ ...plan(), longForm: undefined }, {}),
    ).toThrow('not a long-form video');
  });
});

describe('long-form storyboard tool schemas', () => {
  it('renders a long-form stage only with its quote hash, cutaways only with their ids', () => {
    const render = startStoryboardLongFormToolSchema;
    const input = {
      brandId: 'brand-1',
      runId: 'run-1',
      expectedRevision: 2,
      inputHash: 'b'.repeat(64),
    };
    expect(render.safeParse({ ...input, stage: 'presenter' }).success).toBe(
      true,
    );
    expect(
      render.safeParse({ ...input, stage: 'cutaways', cutawayIds: ['cut-1'] })
        .success,
    ).toBe(true);
    expect(render.safeParse({ ...input, stage: 'cutaways' }).success).toBe(
      false,
    );
    expect(
      render.safeParse({ ...input, stage: 'animatic', cutawayIds: ['cut-1'] })
        .success,
    ).toBe(false);
    expect(
      render.safeParse({ ...input, stage: 'presenter', inputHash: undefined })
        .success,
    ).toBe(false);
    const longForm = storyboardLongFormToolSchema;
    expect(
      longForm.safeParse({ brandId: 'brand-1', runId: 'run-1', action: 'get' })
        .success,
    ).toBe(true);
    expect(
      longForm.safeParse({
        brandId: 'brand-1',
        runId: 'run-1',
        action: 'quote',
        stage: 'presenter',
      }).success,
    ).toBe(false);
  });
});
