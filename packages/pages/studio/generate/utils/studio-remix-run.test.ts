import type { BrandRemixRunView } from '@genfeedai/contracts/api-types/contracts';
import { getDefaultStudioGenerateSettings } from '@pages/studio/generate/utils/studio-generate-settings';
import { describe, expect, it } from 'vitest';
import {
  buildStudioRemixRunEdits,
  clampRemixDurationSeconds,
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

describe('buildStudioRemixRunEdits', () => {
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
