import type { BrandRemixRunView } from '@genfeedai/contracts/api-types/contracts';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import { describe, expect, it } from 'vitest';
import {
  buildStudioRemixRunEdits,
  clampRemixDurationSeconds,
  getRemixDraftComposerState,
} from './studio-remix-run';

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
        role: 'style',
        source: 'explicit',
      },
    ],
    reviewRequired: true,
    target: { kind: 'organic', platform: 'tiktok' },
  },
} as BrandRemixRunView;

describe('clampRemixDurationSeconds', () => {
  it('rounds and clamps remix duration to the declared 1–300 second bounds', () => {
    expect(clampRemixDurationSeconds(5000)).toBe(300);
    expect(clampRemixDurationSeconds(0.4)).toBe(1);
    expect(clampRemixDurationSeconds('12.6')).toBe(13);
    expect(clampRemixDurationSeconds('')).toBeUndefined();
    expect(clampRemixDurationSeconds('abc')).toBeUndefined();
  });
});

describe('getRemixDraftComposerState', () => {
  it('restores authorized media settings from the current run draft', () => {
    expect(getRemixDraftComposerState(run)).toEqual({
      prompt: 'Original objective',
      settings: {
        aspectRatio: '9:16',
        duration: 8,
        outputs: 3,
      },
      type: 'video',
    });
  });
});

describe('buildStudioRemixRunEdits', () => {
  it('sends prompt settings and authorized reference ids back through the run contract', () => {
    const edits = buildStudioRemixRunEdits(
      run,
      'Keep the proof and sharpen the product reveal.',
      {
        ...getDefaultStudioGenerateSettings('video'),
        aspectRatio: '9:16',
        duration: 8,
        outputs: 4,
      },
      'video',
    );

    expect(edits).toMatchObject({
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
          role: 'style',
        },
      ],
    });
  });

  it('clears stale duration when the canonical run output is image', () => {
    const imageRun = {
      ...run,
      draft: {
        ...run.draft,
        output: { aspectRatio: '1:1', count: 2, kind: 'image' as const },
      },
    };

    expect(
      buildStudioRemixRunEdits(
        imageRun,
        'Square product proof',
        getDefaultStudioGenerateSettings('image'),
        'image',
      ).output,
    ).toMatchObject({ durationSeconds: null, kind: 'image' });
  });

  it('preserves the canonical durable avatar identity when starting the restored run', () => {
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
      buildStudioRemixRunEdits(
        avatarRun,
        'Keep the selected spokesperson.',
        getDefaultStudioGenerateSettings('avatar'),
        'avatar',
      ).identity,
    ).toEqual({
      avatarAssetId: 'avatar-row-1',
      speechVoiceId: 'voice-row-1',
    });
  });

  it('clears canonical avatar identity only when switching the run away from avatar output', () => {
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
      buildStudioRemixRunEdits(
        avatarRun,
        'Turn the spokesperson concept into a still.',
        getDefaultStudioGenerateSettings('image'),
        'image',
      ).identity,
    ).toEqual({ avatarAssetId: null, speechVoiceId: null });
  });

  it('clamps out-of-range duration before a revision call', () => {
    expect(
      buildStudioRemixRunEdits(
        run,
        'Keep the proof and sharpen the product reveal.',
        {
          ...getDefaultStudioGenerateSettings('video'),
          duration: 5000.4,
          outputs: 4,
        },
        'video',
      ).output,
    ).toMatchObject({ durationSeconds: 300 });
  });

  it('omits invalid duration instead of sending it to the revision contract', () => {
    expect(
      buildStudioRemixRunEdits(
        run,
        'Keep the proof and sharpen the product reveal.',
        {
          ...getDefaultStudioGenerateSettings('video'),
          duration: Number.NaN,
        },
        'video',
      ).output,
    ).not.toHaveProperty('durationSeconds');
  });

  it('carries newly selected Library identities into the canonical recipe', () => {
    const edits = buildStudioRemixRunEdits(
      run,
      'Use the selected customer proof image.',
      getDefaultStudioGenerateSettings('video'),
      'video',
      ['library-proof-1', 'explicit-reference-1', 'brand-reference-1'],
    );

    expect(edits.references).toEqual([
      { assetId: 'explicit-reference-1', role: 'style' },
      { assetId: 'library-proof-1', role: 'style' },
      { assetId: 'brand-reference-1', role: 'style' },
    ]);
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
      buildStudioRemixRunEdits(
        copyRun,
        'Write four proof-led posts.',
        { ...getDefaultStudioGenerateSettings('image'), outputs: 4 },
        'image',
      ).output,
    ).toEqual({ count: 4, kind: 'copy' });
  });
});
