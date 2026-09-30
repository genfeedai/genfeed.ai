import type { StoryboardPlan } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { describe, expect, it } from 'vitest';
import {
  editStoryboardShot,
  editStoryboardStyle,
  removeStoryboardShot,
  reorderStoryboardShots,
  storyboardApprovalProblems,
} from './storyboard-plan';

const plan: StoryboardPlan = {
  title: 'Plan',
  logline: '',
  format: '9:16',
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
});
