import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';
import {
  editStoryboardCutaway,
  editStoryboardSegment,
  editStoryboardShot,
  editStoryboardStyle,
  insertStoryboardShot,
  overlayStoryboardStills,
  removeStoryboardShot,
  reorderStoryboardShots,
  storyboardApprovalProblems,
  storyboardLongFormApprovalProblems,
  storyboardShotsNeedingStills,
  storyboardSlideshowApprovalProblems,
} from './storyboard-plan';

const plan: StoryboardPlan = {
  title: 'Plan',
  logline: '',
  format: '9:16',
  videoModelKey: null,
  runtimeBudgetSeconds: 10,
  styleReferenceAssetIds: [],
  cast: [],
  shots: [1, 2].map((ordinal) => ({
    id: `shot-${ordinal}`,
    ordinal,
    action: 'Look up',
    durationSeconds: 5,
    onScreenSpeaker: false,
    stillAssetId: `image-${ordinal}`,
    stillFreshness: 'fresh',
    transition: 'cut',
  })),
};
describe('saved plan editing', () => {
  it('marks only the changed action stale and leaves notes independent', () => {
    expect(
      editStoryboardShot(plan, 'shot-1', { action: 'Turn around' }).shots.map(
        (shot) => shot.stillFreshness,
      ),
    ).toEqual(['stale', 'fresh']);
    expect(
      editStoryboardShot(plan, 'shot-1', { notes: 'Private production note' })
        .shots[0].stillFreshness,
    ).toBe('fresh');
  });
  it('marks all generated stills stale after a style change', () => {
    expect(
      editStoryboardStyle(plan, { styleLabel: 'Ink' }).shots.every(
        (shot) => shot.stillFreshness === 'stale',
      ),
    ).toBe(true);
    expect(
      editStoryboardStyle(plan, {
        styleReferenceAssetIds: ['reference'],
      }).shots.every((shot) => shot.stillFreshness === 'stale'),
    ).toBe(true);
  });
  it('preserves shot identity while renumbering reorder/delete', () => {
    expect(
      reorderStoryboardShots(plan, 'shot-2', -1).shots.map((shot) => [
        shot.id,
        shot.ordinal,
      ]),
    ).toEqual([
      ['shot-2', 1],
      ['shot-1', 2],
    ]);
    expect(
      removeStoryboardShot(plan, 'shot-1').shots.map((shot) => [
        shot.id,
        shot.ordinal,
      ]),
    ).toEqual([['shot-2', 1]]);
  });
  it('names fresh-still and cast-voice blockers without approving them', () => {
    expect(storyboardApprovalProblems(plan)).toEqual([]);
    const invalid = editStoryboardShot(plan, 'shot-1', {
      dialogue: 'Hello',
      stillFreshness: 'stale',
    });
    expect(storyboardApprovalProblems(invalid)).toEqual([
      'Shot 1: stale still.',
      'Shot 1: assign a speaker with a voice.',
    ]);
  });
  it('inserts a shot between two shots and renumbers without touching the others', () => {
    const inserted = insertStoryboardShot(plan, 1, {
      id: 'shot-new',
      action: '',
      onScreenSpeaker: false,
      durationSeconds: 3,
      stillFreshness: 'missing',
      transition: 'cut',
    });
    expect(inserted.shots.map((shot) => [shot.id, shot.ordinal])).toEqual([
      ['shot-1', 1],
      ['shot-new', 2],
      ['shot-2', 3],
    ]);
    expect(insertStoryboardShot(plan, 99, plan.shots[0]).shots).toHaveLength(3);
  });
  it('drops an interpolation whose next shot was replaced by the inserted one', () => {
    const interpolating = editStoryboardShot(plan, 'shot-1', {
      transition: 'interpolate',
    });
    const inserted = insertStoryboardShot(interpolating, 1, {
      id: 'shot-new',
      action: '',
      onScreenSpeaker: false,
      durationSeconds: 3,
      stillFreshness: 'missing',
      transition: 'cut',
    });
    expect(inserted.shots[0].transition).toBe('cut');
  });
});

describe('server-owned stills', () => {
  it('shows the server still while it generates or after it lands, and keeps local staleness otherwise', () => {
    const local = editStoryboardShot(plan, 'shot-1', { action: 'Turn' });
    const saved = {
      ...plan,
      shots: [
        { ...plan.shots[0] },
        {
          ...plan.shots[1],
          stillAssetId: undefined,
          stillFreshness: 'generating' as const,
        },
      ],
    };
    expect(
      overlayStoryboardStills(local, saved).shots.map((shot) => [
        shot.stillAssetId,
        shot.stillFreshness,
      ]),
    ).toEqual([
      ['image-1', 'stale'],
      [undefined, 'generating'],
    ]);
    const landed = {
      ...saved,
      shots: [
        saved.shots[0],
        {
          ...saved.shots[1],
          stillAssetId: 'sketch-2',
          stillFreshness: 'fresh' as const,
        },
      ],
    };
    expect(
      overlayStoryboardStills(overlayStoryboardStills(local, saved), landed)
        .shots[1],
    ).toMatchObject({ stillAssetId: 'sketch-2', stillFreshness: 'fresh' });
  });

  it('never stales a generating still on a local edit', () => {
    const generating = {
      ...plan,
      shots: [
        { ...plan.shots[0], stillFreshness: 'generating' as const },
        plan.shots[1],
      ],
    };
    expect(
      editStoryboardShot(generating, 'shot-1', { action: 'Turn' }).shots[0]
        .stillFreshness,
    ).toBe('generating');
  });

  it('lists only described shots that need a still', () => {
    const board = {
      ...plan,
      shots: [
        { ...plan.shots[0], stillFreshness: 'stale' as const },
        { ...plan.shots[1], action: ' ', stillFreshness: 'missing' as const },
      ],
    };
    expect(storyboardShotsNeedingStills(board).map((shot) => shot.id)).toEqual([
      'shot-1',
    ]);
  });
});

const longFormPlan: StoryboardPlan = {
  ...plan,
  format: '16:9',
  runtimeBudgetSeconds: null,
  shots: [],
  cast: [
    {
      id: 'presenter-1',
      name: 'Presenter',
      referenceAssetIds: [],
      avatarAssetId: 'avatar-1',
    },
  ],
  longForm: {
    runtimeBudgetSeconds: 600,
    presenterId: 'presenter-1',
    segments: [
      {
        id: 'segment-1',
        ordinal: 1,
        narration: 'Start here.',
        estimatedSeconds: 3,
        cutaways: [
          {
            id: 'cut-1',
            kind: 'still',
            brief: 'A desk',
            assetId: 'image-9',
            startSeconds: 0,
            durationSeconds: 2,
          },
        ],
      },
    ],
  },
} as StoryboardPlan;
const messages = { noScript: 'no script', presenter: 'presenter' };

describe('long-form plan editing', () => {
  it('edits a segment narration and drops footage of a rewritten cutaway', () => {
    expect(
      editStoryboardSegment(longFormPlan, 'segment-1', { narration: 'New.' })
        .longForm?.segments[0]?.narration,
    ).toBe('New.');
    const rewritten = editStoryboardCutaway(longFormPlan, 'cut-1', {
      brief: 'A window',
    }).longForm?.segments[0]?.cutaways[0];
    expect(rewritten).toMatchObject({ brief: 'A window' });
    expect(rewritten?.assetId).toBeUndefined();
  });
  it('shows a cutaway still the server attached unless the cutaway changed', () => {
    const local = editStoryboardSegment(longFormPlan, 'segment-1', {
      narration: 'Start here.',
    });
    const withoutAsset = editStoryboardCutaway(local, 'cut-1', {
      brief: 'A desk',
    });
    expect(
      overlayStoryboardStills(withoutAsset, longFormPlan).longForm?.segments[0]
        ?.cutaways[0]?.assetId,
    ).toBe('image-9');
    const rewritten = editStoryboardCutaway(local, 'cut-1', {
      brief: 'A window',
    });
    expect(
      overlayStoryboardStills(rewritten, longFormPlan).longForm?.segments[0]
        ?.cutaways[0]?.assetId,
    ).toBeUndefined();
  });
  it('needs a script and a presenter with an avatar and a voice', () => {
    expect(storyboardLongFormApprovalProblems(longFormPlan, messages)).toEqual([
      'presenter',
    ]);
    expect(
      storyboardLongFormApprovalProblems(
        {
          ...longFormPlan,
          cast: [
            {
              id: 'presenter-1',
              name: 'Presenter',
              referenceAssetIds: [],
              avatarAssetId: 'avatar-1',
              voiceId: 'voice-1',
            },
          ],
          longForm: {
            runtimeBudgetSeconds: 600,
            presenterId: 'presenter-1',
            segments: [],
          },
        } as StoryboardPlan,
        messages,
      ),
    ).toEqual(['no script']);
    expect(storyboardLongFormApprovalProblems(plan, messages)).toEqual([]);
  });
});

describe('storyboardSlideshowApprovalProblems', () => {
  const messages = {
    count: 'count',
    description: (ordinal: number) => `describe ${ordinal}`,
    image: (ordinal: number) => `image ${ordinal}`,
  };
  const slideshow = (shots: StoryboardPlan['shots']): StoryboardPlan => ({
    ...plan,
    kind: 'slideshow',
    format: '4:5',
    runtimeBudgetSeconds: null,
    shots,
  });
  const slide = (
    ordinal: number,
    overrides: Partial<StoryboardPlan['shots'][number]> = {},
  ): StoryboardPlan['shots'][number] => ({
    id: `slide-${ordinal}`,
    ordinal,
    action: 'A calm desk',
    durationSeconds: null,
    onScreenSpeaker: false,
    stillAssetId: `image-${ordinal}`,
    stillFreshness: 'fresh',
    transition: 'cut',
    ...overrides,
  });
  it('is ready when 2 to 12 slides are described and drawn', () => {
    expect(
      storyboardSlideshowApprovalProblems(
        slideshow([slide(1), slide(2)]),
        messages,
      ),
    ).toEqual([]);
  });
  it('needs at least two slides', () => {
    expect(
      storyboardSlideshowApprovalProblems(slideshow([slide(1)]), messages),
    ).toEqual(['count']);
  });
  it('names the slides that are blank or have no fresh image', () => {
    expect(
      storyboardSlideshowApprovalProblems(
        slideshow([
          slide(1, { action: ' ' }),
          slide(2, { stillFreshness: 'stale' }),
          slide(3, { stillAssetId: undefined, stillFreshness: 'missing' }),
        ]),
        messages,
      ),
    ).toEqual(['describe 1', 'image 2', 'image 3']);
  });
  it('does not ask for durations or a runtime budget', () => {
    expect(
      storyboardSlideshowApprovalProblems(
        slideshow([slide(1), slide(2)]),
        messages,
      ).join(' '),
    ).not.toMatch(/duration|runtime/i);
  });
});
