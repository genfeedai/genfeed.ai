import {
  assembleStoryboardLongFormDraft,
  fitStoryboardCutaways,
  normalizeStoryboardLongForm,
  STORYBOARD_PRESENTER_NAME,
  type StoryboardLongFormDraftOutput,
  type StoryboardLongFormDraftRequest,
  storyboardLongFormProblems,
} from '@api/collections/content-runs/services/storyboard-long-form-draft';
import { StoryboardDraftOutputError } from '@api/collections/content-runs/services/storyboard-plan-draft';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';

const emptyPlan: StoryboardPlan = {
  videoModelKey: null,
  title: '',
  logline: '',
  format: '16:9',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [],
  longForm: { runtimeBudgetSeconds: 600, segments: [] },
};

// 120 characters at 12 characters per second: a ten second segment.
const TEN_SECONDS = 'a'.repeat(120);

function segment(
  overrides: Partial<StoryboardLongFormDraftOutput['segments'][number]> = {},
): StoryboardLongFormDraftOutput['segments'][number] {
  return {
    existingSegmentId: null,
    sectionLabel: 'Hook',
    narration: TEN_SECONDS,
    cutaways: [],
    ...overrides,
  };
}

function request(
  overrides: Partial<StoryboardLongFormDraftRequest> = {},
): StoryboardLongFormDraftRequest {
  return {
    brand: {
      brief: 'Voice: plain. Guardrails: no income claims.',
      name: 'Acme',
    },
    brief: 'I keep seeing founders underprice their first plan.',
    current: emptyPlan,
    mode: 'draft',
    runtimeBudgetSeconds: 600,
    ...overrides,
  };
}

describe('fitStoryboardCutaways', () => {
  it('clamps cutaways inside the segment and removes overlaps', () => {
    const fitted = fitStoryboardCutaways(
      [
        { kind: 'still', brief: 'B', startSeconds: 6, durationSeconds: 10 },
        { kind: 'still', brief: 'A', startSeconds: 0, durationSeconds: 8 },
        { kind: 'still', brief: 'C', startSeconds: 12, durationSeconds: 2 },
      ],
      10,
    );

    expect(
      fitted.map(({ brief, startSeconds, durationSeconds }) => ({
        brief,
        startSeconds,
        durationSeconds,
      })),
    ).toEqual([
      { brief: 'A', startSeconds: 0, durationSeconds: 8 },
      { brief: 'B', startSeconds: 8, durationSeconds: 2 },
    ]);
  });

  it('keeps the id and asset of an unchanged cutaway', () => {
    const [kept] = fitStoryboardCutaways(
      [{ kind: 'still', brief: 'A', startSeconds: 1, durationSeconds: 2 }],
      10,
      [
        {
          id: 'cutaway-1',
          kind: 'still',
          brief: 'A',
          assetId: 'asset-1',
          startSeconds: 0,
          durationSeconds: 3,
        },
      ],
    );

    expect(kept).toMatchObject({ id: 'cutaway-1', assetId: 'asset-1' });
  });
});

describe('assembleStoryboardLongFormDraft', () => {
  it('builds segments with estimated lengths and a presenter', () => {
    const plan = assembleStoryboardLongFormDraft(request(), {
      title: 'Pricing',
      logline: 'Why your first plan is too cheap.',
      segments: [segment(), segment({ sectionLabel: 'Point' })],
    });

    expect(plan.shots).toEqual([]);
    expect(plan.cast).toHaveLength(1);
    expect(plan.cast[0]?.name).toBe(STORYBOARD_PRESENTER_NAME);
    expect(plan.longForm?.presenterId).toBe(plan.cast[0]?.id);
    expect(
      plan.longForm?.segments.map(({ ordinal, estimatedSeconds }) => ({
        ordinal,
        estimatedSeconds,
      })),
    ).toEqual([
      { ordinal: 1, estimatedSeconds: 10 },
      { ordinal: 2, estimatedSeconds: 10 },
    ]);
  });

  it('keeps segment ids on revise and drops unknown ones', () => {
    const current = assembleStoryboardLongFormDraft(request(), {
      title: 'Pricing',
      logline: '',
      segments: [segment()],
    });
    const keptId = current.longForm?.segments[0]?.id ?? '';

    const revised = assembleStoryboardLongFormDraft(
      request({ current, mode: 'revise' }),
      {
        title: 'Pricing',
        logline: '',
        segments: [
          segment({ existingSegmentId: keptId }),
          segment({ existingSegmentId: 'made-up' }),
        ],
      },
    );

    expect(revised.longForm?.segments[0]?.id).toBe(keptId);
    expect(revised.longForm?.segments[1]?.id).not.toBe('made-up');
    expect(revised.longForm?.presenterId).toBe(current.longForm?.presenterId);
  });

  it('rejects a draft longer than the runtime budget', () => {
    expect(() =>
      assembleStoryboardLongFormDraft(request({ runtimeBudgetSeconds: 15 }), {
        title: 'Pricing',
        logline: '',
        segments: [segment(), segment()],
      }),
    ).toThrow(StoryboardDraftOutputError);
  });
});

describe('storyboardLongFormProblems', () => {
  it('lists what blocks approval until the presenter is ready', () => {
    const plan = assembleStoryboardLongFormDraft(request(), {
      title: 'Pricing',
      logline: '',
      segments: [segment()],
    });

    expect(storyboardLongFormProblems(plan)).toEqual([
      'Give the presenter an avatar image.',
      'Give the presenter a voice.',
    ]);
    expect(
      storyboardLongFormProblems({
        ...plan,
        cast: plan.cast.map((member) => ({
          ...member,
          avatarAssetId: 'avatar-1',
          voiceId: 'voice-1',
        })),
      }),
    ).toEqual([]);
  });

  it('asks for a segment on an empty plan', () => {
    expect(storyboardLongFormProblems(emptyPlan)).toContain(
      'Draft or write at least one segment.',
    );
  });
});

describe('normalizeStoryboardLongForm', () => {
  it('recomputes ordinals, lengths and cutaway fit after an edit', () => {
    const plan = assembleStoryboardLongFormDraft(request(), {
      title: 'Pricing',
      logline: '',
      segments: [segment(), segment()],
    });
    const [first, second] = plan.longForm?.segments ?? [];
    if (!first || !second || !plan.longForm) throw new Error('No segments');

    const normalized = normalizeStoryboardLongForm({
      ...plan,
      longForm: {
        ...plan.longForm,
        segments: [
          {
            ...second,
            ordinal: 1,
            narration: 'a'.repeat(60),
            cutaways: [
              {
                id: 'cutaway-1',
                kind: 'motion_graphic',
                brief: 'Chart',
                startSeconds: 2,
                durationSeconds: 20,
              },
            ],
          },
          { ...first, ordinal: 2 },
        ],
      },
    });

    expect(normalized.longForm?.segments[0]).toMatchObject({
      id: second.id,
      ordinal: 1,
      estimatedSeconds: 5,
      cutaways: [{ id: 'cutaway-1', startSeconds: 2, durationSeconds: 3 }],
    });
    expect(normalized.longForm?.segments[1]?.ordinal).toBe(2);
  });
});
