import type { BrandRemixRunView } from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildStoryboardRunEdits,
  clampRunDurationSeconds,
  getStoryboardRunAspectRatioOptions,
  getStoryboardRunRecipe,
} from './storyboard-run';

const run = {
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: {
      hook: 'Proof before promise',
      objective: 'Original objective',
    },
    output: {
      aspectRatio: '9:16',
      count: 3,
      durationSeconds: 8,
      kind: 'video',
    },
    references: [
      {
        assetId: 'brand-reference-1',
        description: 'Northstar product close-up',
        role: 'product',
        source: 'brand_default',
      },
      {
        assetId: 'explicit-reference-1',
        description: 'Warm studio light',
        role: 'style',
        source: 'explicit',
      },
    ],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
} as BrandRemixRunView;

describe('clampRunDurationSeconds', () => {
  it('rounds and clamps run duration to the declared 1–300 second bounds', () => {
    expect(clampRunDurationSeconds(5000)).toBe(300);
    expect(clampRunDurationSeconds(0.4)).toBe(1);
    expect(clampRunDurationSeconds('12.6')).toBe(13);
    expect(clampRunDurationSeconds('')).toBeUndefined();
    expect(clampRunDurationSeconds('abc')).toBeUndefined();
  });
});

describe('getStoryboardRunRecipe', () => {
  it('restores the authorized recipe from the current run draft', () => {
    expect(getStoryboardRunRecipe(run)).toEqual({
      aspectRatio: '9:16',
      count: 3,
      durationSeconds: 8,
      objective: 'Original objective',
      referenceAssetIds: ['explicit-reference-1'],
    });
  });

  it('has no frame or duration for copy output', () => {
    expect(
      getStoryboardRunRecipe({
        ...run,
        draft: { ...run.draft, output: { count: 2, kind: 'copy' } },
      }),
    ).toEqual({
      count: 2,
      objective: 'Original objective',
      referenceAssetIds: ['explicit-reference-1'],
    });
  });
});

describe('getStoryboardRunAspectRatioOptions', () => {
  it('keeps an unusual saved ratio selectable without duplicating it', () => {
    expect(
      getStoryboardRunAspectRatioOptions('21:9').map((option) => option.value),
    ).toEqual(['21:9', '9:16', '1:1', '4:5', '16:9']);
    expect(getStoryboardRunAspectRatioOptions('1:1')).toHaveLength(4);
  });
});

describe('buildStoryboardRunEdits', () => {
  it('sends the recipe and explicit references back through the run contract', () => {
    const edits = buildStoryboardRunEdits(run, {
      aspectRatio: '9:16',
      count: 4,
      durationSeconds: 8,
      objective: '  Keep the proof and sharpen the product reveal. ',
      referenceAssetIds: ['explicit-reference-1'],
    });

    expect(edits).toEqual({
      fidelityMode: 'guided',
      intent: {
        hook: 'Proof before promise',
        objective: 'Keep the proof and sharpen the product reveal.',
      },
      output: {
        aspectRatio: '9:16',
        count: 4,
        durationSeconds: 8,
        kind: 'video',
      },
      references: [
        {
          assetId: 'explicit-reference-1',
          description: 'Warm studio light',
          role: 'style',
        },
      ],
      target: { kind: 'organic', platform: 'tiktok' },
    });
  });

  it('adds new Library picks as style references and drops removed ones', () => {
    const edits = buildStoryboardRunEdits(run, {
      ...getStoryboardRunRecipe(run),
      referenceAssetIds: ['library-proof-1', 'library-proof-1'],
    });

    expect(edits.references).toEqual([
      { assetId: 'library-proof-1', role: 'style' },
    ]);
  });

  it('clears stale duration when the run output is image', () => {
    const imageRun = {
      ...run,
      draft: {
        ...run.draft,
        output: { aspectRatio: '1:1', count: 2, kind: 'image' as const },
      },
    };

    expect(
      buildStoryboardRunEdits(imageRun, {
        ...getStoryboardRunRecipe(imageRun),
        durationSeconds: 5,
      }).output,
    ).toEqual({
      aspectRatio: '1:1',
      count: 2,
      durationSeconds: null,
      kind: 'image',
    });
  });

  it('preserves the canonical durable avatar identity', () => {
    const avatarRun = {
      ...run,
      draft: {
        ...run.draft,
        identity: {
          avatarAssetId: 'avatar-row-1',
          speechVoiceId: 'voice-row-1',
        },
        output: {
          aspectRatio: '9:16',
          count: 2,
          durationSeconds: 12,
          kind: 'avatar' as const,
        },
      },
    };

    expect(
      buildStoryboardRunEdits(avatarRun, getStoryboardRunRecipe(avatarRun))
        .identity,
    ).toEqual({
      avatarAssetId: 'avatar-row-1',
      speechVoiceId: 'voice-row-1',
    });
  });

  it('clamps out-of-range duration and omits an invalid one', () => {
    const recipe = getStoryboardRunRecipe(run);
    expect(
      buildStoryboardRunEdits(run, { ...recipe, durationSeconds: 5000.4 })
        .output,
    ).toMatchObject({ durationSeconds: 300 });
    expect(
      buildStoryboardRunEdits(run, { ...recipe, durationSeconds: Number.NaN })
        .output,
    ).not.toHaveProperty('durationSeconds');
  });

  it('preserves copy output instead of translating it into a media type', () => {
    const copyRun = {
      ...run,
      draft: {
        ...run.draft,
        output: { count: 4, kind: 'copy' as const },
      },
    };

    expect(
      buildStoryboardRunEdits(copyRun, {
        ...getStoryboardRunRecipe(copyRun),
        objective: 'Write four proof-led posts.',
      }).output,
    ).toEqual({ count: 4, kind: 'copy' });
  });
});
