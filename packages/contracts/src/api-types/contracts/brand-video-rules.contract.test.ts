import { describe, expect, it } from 'vitest';
import type { BrandGenerationRulesV1 } from '../../interfaces/content/branded-generation.interface';
import { brandVideoFinishingV1Schema } from './brand-video-finishing.contract';
import {
  isOwnerVideoRulesValid,
  mergeOwnerVideoRules,
  OWNER_VIDEO_EVIDENCE_ID,
} from './brand-video-identity.contract';
import { brandGenerationRulesV1Schema } from './branded-generation.contract';

function baseRules(): BrandGenerationRulesV1 {
  return {
    assets: [
      {
        assetId: 'asset-logo',
        evidenceIds: ['evidence'],
        id: 'logo-asset',
        required: false,
        role: 'logo',
      },
    ],
    avoid: [],
    evidence: [
      { id: 'evidence', label: 'Owner attestation', sourceType: 'manual' },
    ],
    examples: [],
    facts: [],
    mandatory: [],
    palette: [],
    schemaVersion: 1,
    typography: [
      {
        availability: 'unknown',
        evidenceIds: ['evidence'],
        family: 'Inter',
        id: 'body-font',
        required: false,
        role: 'body',
        style: 'normal',
        weight: 400,
      },
    ],
  };
}

function videoRules(): NonNullable<BrandGenerationRulesV1['video']> {
  return {
    captions: {
      evidenceIds: ['evidence'],
      position: 'bottom',
      style: 'minimal',
      typographyRuleId: 'body-font',
    },
    logoPlacement: {
      appliesTo: 'outro',
      assetReferenceId: 'logo-asset',
      evidenceIds: ['evidence'],
      insetRatio: 0.04,
      position: 'top-right',
      sizeRatio: 0.12,
    },
    motionStyle: { evidenceIds: ['evidence'], style: 'subtle' },
    pacing: {
      averageShotSeconds: 3,
      evidenceIds: ['evidence'],
      tempo: 'medium',
    },
    shotRules: [
      {
        evidenceIds: ['evidence'],
        id: 'shot-open',
        match: 'semantic',
        required: true,
        text: 'Open on the product in the first second',
      },
    ],
    thumbnailRules: [],
  };
}

describe('brandGenerationRulesV1Schema video section', () => {
  it('accepts rules with no video section, so existing revisions keep parsing', () => {
    expect(brandGenerationRulesV1Schema.safeParse(baseRules()).success).toBe(
      true,
    );
  });

  it('accepts a complete video section', () => {
    const parsed = brandGenerationRulesV1Schema.safeParse({
      ...baseRules(),
      video: videoRules(),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown key inside the video section', () => {
    const parsed = brandGenerationRulesV1Schema.safeParse({
      ...baseRules(),
      video: { ...videoRules(), unknown: true },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a shot rule id that collides with another rule id', () => {
    const rules = baseRules();
    const video = videoRules();
    video.shotRules[0] = { ...video.shotRules[0], id: 'body-font' };
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...rules, video }).success,
    ).toBe(false);
  });

  it('rejects video evidence that the rules do not carry', () => {
    const video = videoRules();
    video.motionStyle = { evidenceIds: ['missing'], style: 'subtle' };
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...baseRules(), video }).success,
    ).toBe(false);
  });

  it('rejects a caption typography rule that does not exist', () => {
    const video = videoRules();
    video.captions = {
      evidenceIds: ['evidence'],
      position: 'bottom',
      style: 'minimal',
      typographyRuleId: 'missing-font',
    };
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...baseRules(), video }).success,
    ).toBe(false);
  });

  it('rejects a logo placement that points at a non-logo asset', () => {
    const rules = baseRules();
    rules.assets[0] = { ...rules.assets[0], role: 'banner' };
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...rules, video: videoRules() })
        .success,
    ).toBe(false);
  });

  it.each([
    ['logo size below the minimum', { sizeRatio: 0.01 }],
    ['logo size above the maximum', { sizeRatio: 0.6 }],
    ['logo inset above the maximum', { insetRatio: 0.3 }],
  ])('rejects %s', (_label, change) => {
    const video = videoRules();
    video.logoPlacement = { ...video.logoPlacement, ...change } as NonNullable<
      typeof video.logoPlacement
    >;
    expect(
      brandGenerationRulesV1Schema.safeParse({ ...baseRules(), video }).success,
    ).toBe(false);
  });
});

describe('brandVideoFinishingV1Schema', () => {
  const finishing = {
    endCard: { assetId: 'asset-banner', durationSeconds: 3, isEnabled: true },
    lut: { fileName: 'warm.cube', isEnabled: true },
    watermark: { opacity: 0.35, position: 'bottom-right', text: 'acme.coffee' },
  };

  it('accepts the brand defaults', () => {
    expect(brandVideoFinishingV1Schema.safeParse(finishing).success).toBe(true);
  });

  it.each([
    [
      'end card shorter than one second',
      { endCard: { durationSeconds: 0.5, isEnabled: true } },
    ],
    [
      'end card longer than ten seconds',
      { endCard: { durationSeconds: 11, isEnabled: true } },
    ],
    [
      'watermark opacity of zero',
      { watermark: { opacity: 0, position: 'bottom-right' } },
    ],
    [
      'watermark in the center',
      { watermark: { opacity: 0.5, position: 'center' } },
    ],
  ])('rejects %s', (_label, change) => {
    expect(
      brandVideoFinishingV1Schema.safeParse({ ...finishing, ...change })
        .success,
    ).toBe(false);
  });
});

describe('owner-authored video identity', () => {
  const owner = {
    shotRules: [
      {
        evidenceIds: [OWNER_VIDEO_EVIDENCE_ID],
        id: 'owner-video-shot-1',
        match: 'semantic' as const,
        required: true,
        text: 'Open on the product',
      },
    ],
    thumbnailRules: [],
  };

  it('joins rules that have no video, adding its evidence entry once', () => {
    const merged = mergeOwnerVideoRules(baseRules(), owner);
    expect(merged.video).toEqual(owner);
    expect(merged.evidence.map((entry) => entry.id)).toEqual([
      'evidence',
      OWNER_VIDEO_EVIDENCE_ID,
    ]);
    expect(mergeOwnerVideoRules(merged, owner).evidence).toHaveLength(2);
  });

  it('leaves the rules untouched when the owner wrote no video', () => {
    expect(mergeOwnerVideoRules(baseRules(), undefined)).toEqual(baseRules());
  });

  it('is valid with no scanned rules at all', () => {
    expect(isOwnerVideoRulesValid(undefined, owner)).toBe(true);
  });

  it('is invalid when a rule id collides with a scanned rule', () => {
    const rules = {
      ...baseRules(),
      mandatory: [
        {
          appliesToMediaKinds: ['text' as const],
          evidenceIds: ['evidence'],
          id: 'owner-video-shot-1',
          match: 'literal' as const,
          required: true,
          text: 'Exact',
        },
      ],
    };
    expect(isOwnerVideoRulesValid(rules, owner)).toBe(false);
  });
});
