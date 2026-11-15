import { buildVideoBrandRules } from '@api/services/content-quality/video-brand-rules.util';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it } from 'vitest';

function rules(
  overrides: Partial<BrandGenerationRulesV1>,
): BrandGenerationRulesV1 {
  return {
    assets: [],
    avoid: [],
    evidence: [],
    examples: [],
    facts: [],
    mandatory: [],
    palette: [],
    schemaVersion: 1,
    typography: [],
    ...overrides,
  };
}

describe('buildVideoBrandRules', () => {
  it('returns no text and no logos when the brand has no rules', () => {
    expect(buildVideoBrandRules(null)).toEqual({ logoAssetIds: [], text: '' });
    expect(buildVideoBrandRules(rules({}))).toEqual({
      logoAssetIds: [],
      text: '',
    });
  });

  it('lists the palette, logo, and must/avoid rules that apply to video', () => {
    const result = buildVideoBrandRules(
      rules({
        assets: [
          {
            appliesToMediaKinds: ['video'],
            assetId: 'asset-logo',
            evidenceIds: [],
            id: 'logo-1',
            required: true,
            role: 'logo',
          },
        ],
        avoid: [
          {
            evidenceIds: [],
            id: 'avoid-1',
            match: 'semantic',
            required: true,
            text: 'Stock-photo handshakes',
          },
        ],
        mandatory: [
          {
            evidenceIds: [],
            id: 'must-1',
            match: 'semantic',
            required: true,
            text: 'End on the product shot',
          },
        ],
        palette: [
          {
            color: '#112233',
            evidenceIds: [],
            id: 'pal-1',
            required: true,
            usage: 'primary background',
          },
        ],
      }),
    );

    expect(result.logoAssetIds).toEqual(['asset-logo']);
    expect(result.text).toBe(
      [
        'Approved palette:\n- #112233 (primary background), required',
        'Logo:\n- The approved logo must appear in the video (reference image attached when available).',
        'Must be present:\n- End on the product shot',
        'Must be avoided:\n- Stock-photo handshakes',
      ].join('\n\n'),
    );
  });

  it('leaves out rules scoped to other media kinds and non-logo assets', () => {
    const result = buildVideoBrandRules(
      rules({
        assets: [
          {
            appliesToMediaKinds: ['image'],
            assetId: 'image-logo',
            evidenceIds: [],
            id: 'logo-img',
            required: true,
            role: 'logo',
          },
          {
            assetId: 'banner',
            evidenceIds: [],
            id: 'banner-1',
            required: true,
            role: 'banner',
          },
        ],
        palette: [
          {
            appliesToMediaKinds: ['text'],
            color: '#FFFFFF',
            evidenceIds: [],
            id: 'pal-text',
            required: false,
            usage: 'text only',
          },
        ],
      }),
    );

    expect(result).toEqual({ logoAssetIds: [], text: '' });
  });
});
