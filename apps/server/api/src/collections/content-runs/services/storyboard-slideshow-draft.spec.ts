import {
  assembleStoryboardSlideshowDraft,
  buildStoryboardSlideshowDraftMessages,
  type StoryboardSlideshowDraftRequest,
  storyboardSlideshowDraftOutputSchema,
} from '@api/collections/content-runs/services/storyboard-slideshow-draft';
import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';

const current: StoryboardPlan = {
  kind: 'slideshow',
  title: '',
  logline: '',
  videoModelKey: null,
  format: '4:5',
  runtimeBudgetSeconds: null,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [1, 2].map((ordinal) => ({
    id: `slide-${ordinal}`,
    ordinal,
    sectionLabel: `Old ${ordinal}`,
    action: `Old description ${ordinal}`,
    onScreenSpeaker: false,
    durationSeconds: null,
    stillAssetId: `image-${ordinal}`,
    stillFreshness: 'fresh' as const,
    transition: 'cut' as const,
  })),
};

function request(
  overrides: Partial<StoryboardSlideshowDraftRequest> = {},
): StoryboardSlideshowDraftRequest {
  return {
    brand: { description: 'Coffee', label: 'Beans', name: 'Beans' },
    brief: 'Five morning habits',
    current,
    mode: 'revise',
    organizationId: 'org-1',
    userId: 'user-1',
    ...overrides,
  } as StoryboardSlideshowDraftRequest;
}

const output = {
  title: 'Five habits',
  caption: 'Swipe through.',
  slides: [
    {
      existingSlideId: 'slide-2',
      sectionLabel: 'Wake',
      description: 'Sunrise',
    },
    { existingSlideId: null, sectionLabel: 'Brew', description: 'Pour over' },
  ],
};

describe('storyboard slideshow draft', () => {
  it.each([
    ['one slide', output.slides.slice(0, 1)],
    ['thirteen slides', Array.from({ length: 13 }, () => output.slides[0])],
  ])('rejects a model reply with %s', (_label, slides) => {
    expect(
      storyboardSlideshowDraftOutputSchema.safeParse({ ...output, slides })
        .success,
    ).toBe(false);
  });

  it('keeps a revised slide image under its id and gives a new slide a fresh id and no image', () => {
    const plan = assembleStoryboardSlideshowDraft(request(), output);

    expect(plan).toMatchObject({
      kind: 'slideshow',
      title: 'Five habits',
      logline: 'Swipe through.',
      shots: [
        {
          id: 'slide-2',
          ordinal: 1,
          action: 'Sunrise',
          stillAssetId: 'image-2',
        },
        { ordinal: 2, action: 'Pour over', stillFreshness: 'missing' },
      ],
    });
    expect(plan.shots[1].id).not.toBe('slide-1');
    expect(plan.shots[1].stillAssetId).toBeUndefined();
  });

  it('keeps a seeded first slide image when drafting from a seed image', () => {
    const seeded: StoryboardPlan = {
      ...current,
      shots: [
        {
          ...current.shots[0],
          action: '',
          sectionLabel: undefined,
          stillAssetId: 'seed-image',
        },
      ],
    };

    const plan = assembleStoryboardSlideshowDraft(
      request({ current: seeded, mode: 'draft' }),
      {
        ...output,
        slides: output.slides.map((slide) => ({
          ...slide,
          existingSlideId: null,
        })),
      },
    );

    expect(plan.shots[0]).toMatchObject({
      id: 'slide-1',
      stillAssetId: 'seed-image',
    });
  });

  it('sends the current slides only when revising', () => {
    const revising = JSON.parse(
      String(
        buildStoryboardSlideshowDraftMessages(request(), 'harness')[1].content,
      ),
    );
    const drafting = JSON.parse(
      String(
        buildStoryboardSlideshowDraftMessages(
          request({ mode: 'draft' }),
          'harness',
        )[1].content,
      ),
    );

    expect(revising.currentPlan.slides[0]).toEqual({
      existingSlideId: 'slide-1',
      sectionLabel: 'Old 1',
      description: 'Old description 1',
    });
    expect(drafting.currentPlan).toBeUndefined();
  });
});
