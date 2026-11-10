import { describe, expect, it } from 'vitest';
import type { StoryboardPlan } from './storyboard-plan.contract';
import {
  editStoryboardAssetBible,
  editStoryboardVideoShots,
  storyboardVideoToolSchema,
} from './storyboard-video-tool.contract';

const plan: StoryboardPlan = {
  videoModelKey: null,
  title: 'Late',
  logline: '',
  format: '9:16',
  runtimeBudgetSeconds: 12,
  styleReferenceAssetIds: [],
  cast: [],
  assetBible: [
    {
      id: 'clock',
      kind: 'prop',
      label: 'Clock',
      sourceAssetIds: [],
      variantAssetIds: ['clock-1'],
    },
  ],
  shots: [
    {
      id: 'shot-1',
      ordinal: 1,
      action: 'Mia checks the clock.',
      onScreenSpeaker: false,
      durationSeconds: 6,
      stillFreshness: 'missing',
      transition: 'cut',
    },
  ],
};

describe('storyboard video tool contract', () => {
  it('refuses an unknown shot id', () => {
    expect(() =>
      editStoryboardVideoShots(plan, [{ id: 'shot-9', action: 'Run.' }]),
    ).toThrow('Unknown shot ids: shot-9');
  });

  it('refuses shot edits on a slideshow', () => {
    expect(() =>
      editStoryboardVideoShots({ ...plan, kind: 'slideshow' }, []),
    ).toThrow('This storyboard is not a shot-by-shot video.');
  });

  it('removes an entry by id', () => {
    expect(
      editStoryboardAssetBible(plan, { removeEntryIds: ['clock'] }).assetBible,
    ).toEqual([]);
  });

  it.each([
    [
      'a quote for assets without an action',
      { stage: 'assets', entryId: 'clock' },
      false,
    ],
    ['a quote for every shot without a draft', { stage: 'draft' }, true],
    ['angles on a final quote', { stage: 'final', angles: ['back'] }, false],
  ])('parses %s', (_label, target, isValid) => {
    expect(
      storyboardVideoToolSchema.safeParse({
        action: 'quote',
        brandId: 'brand-1',
        runId: 'run-1',
        expectedRevision: 2,
        ...target,
      }).success,
    ).toBe(isValid);
  });
});
