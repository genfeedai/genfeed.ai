import { describe, expect, it } from 'vitest';
import {
  type StoryboardPlan,
  storyboardPlanSchema,
} from './storyboard-plan.contract';
import {
  editStoryboardSlideshow,
  startStoryboardSlideshowToolSchema,
  storyboardSlideshowToolSchema,
} from './storyboard-slideshow-tool.contract';

function plan(): StoryboardPlan {
  return {
    cast: [],
    format: '4:5',
    kind: 'slideshow',
    logline: 'Swipe for habits.',
    runtimeBudgetSeconds: null,
    shots: ['a', 'b', 'c'].map((id, index) => ({
      action: `Habit ${id}`,
      durationSeconds: null,
      id: `slide-${id}`,
      onScreenSpeaker: false,
      ordinal: index + 1,
      stillFreshness: 'missing' as const,
      transition: 'cut' as const,
    })),
    styleReferenceAssetIds: [],
    title: 'Habits',
    videoModelKey: null,
  };
}

const run = { brandId: 'brand-1', runId: 'run-1' };

describe('storyboard slideshow plan', () => {
  it('accepts a 4:5 slideshow of stills', () => {
    expect(storyboardPlanSchema.safeParse(plan()).success).toBe(true);
  });

  it.each([
    ['a runtime', { runtimeBudgetSeconds: 10 }],
    [
      'a long-form body',
      {
        longForm: { presenterId: null, runtimeBudgetSeconds: 10, segments: [] },
      },
    ],
  ])('refuses a slideshow with %s', (_label, change) => {
    expect(
      storyboardPlanSchema.safeParse({ ...plan(), ...change }).success,
    ).toBe(false);
  });

  it('refuses a slide with a duration', () => {
    const base = plan();
    const result = storyboardPlanSchema.safeParse({
      ...base,
      shots: [{ ...base.shots[0], durationSeconds: 5 }, ...base.shots.slice(1)],
    });

    expect(result.success).toBe(false);
  });
});

describe('storyboard slideshow tool schemas', () => {
  it('accepts a create with style references and cast', () => {
    expect(
      storyboardSlideshowToolSchema.safeParse({
        action: 'create',
        brandId: 'brand-1',
        brief: 'Five morning habits',
        cast: [{ name: 'Ana', referenceAssetIds: ['ana-1'] }],
        clientRequestId: 'd160833e-d602-4617-a21b-721eb9aa7da8',
        styleReferenceAssetIds: ['style-1'],
      }).success,
    ).toBe(true);
  });

  it.each([
    ['an unknown action', { ...run, action: 'publish' }],
    [
      'duplicate order ids',
      {
        ...run,
        action: 'edit_slides',
        expectedRevision: 1,
        order: ['slide-a', 'slide-a'],
      },
    ],
    [
      'an edit without a revision',
      { ...run, action: 'edit_slides', title: 'x' },
    ],
  ])('rejects %s', (_label, input) => {
    expect(storyboardSlideshowToolSchema.safeParse(input).success).toBe(false);
  });

  it('requires a 64-character quote hash to start the images', () => {
    const input = { ...run, expectedRevision: 2 };

    expect(
      startStoryboardSlideshowToolSchema.safeParse({
        ...input,
        inputHash: 'a'.repeat(64),
      }).success,
    ).toBe(true);
    expect(
      startStoryboardSlideshowToolSchema.safeParse({
        ...input,
        inputHash: 'abc',
      }).success,
    ).toBe(false);
  });
});

describe('editStoryboardSlideshow', () => {
  it('reorders slides, renumbers them and drops those left out', () => {
    const edited = editStoryboardSlideshow(plan(), {
      order: ['slide-c', 'slide-a'],
    });

    expect(edited.shots.map((shot) => [shot.id, shot.ordinal])).toEqual([
      ['slide-c', 1],
      ['slide-a', 2],
    ]);
  });

  it('changes only the fields it is given', () => {
    const edited = editStoryboardSlideshow(plan(), {
      caption: 'New caption',
      slides: [{ id: 'slide-b', description: 'A new habit' }],
    });

    expect(edited).toMatchObject({ logline: 'New caption', title: 'Habits' });
    expect(edited.shots.map((shot) => shot.action)).toEqual([
      'Habit a',
      'A new habit',
      'Habit c',
    ]);
  });

  it('names slide ids the plan does not have', () => {
    expect(() =>
      editStoryboardSlideshow(plan(), { order: ['slide-z', 'slide-a'] }),
    ).toThrow('Unknown slide ids: slide-z');
  });

  it('refuses to edit a video storyboard as a slideshow', () => {
    expect(() =>
      editStoryboardSlideshow({ ...plan(), kind: 'video' }, { title: 'x' }),
    ).toThrow('This storyboard is not a slideshow.');
  });
});
