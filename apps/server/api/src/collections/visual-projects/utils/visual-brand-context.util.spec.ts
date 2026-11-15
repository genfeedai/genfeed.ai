import {
  projectVisualBrandContext,
  VISUAL_BRAND_HARNESS_CHAR_LIMIT,
} from '@api/collections/visual-projects/utils/visual-brand-context.util';
import type { BrandIdentitySnapshotV1 } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const hash = `sha256:${'a'.repeat(64)}`;

function snapshot(
  overrides: Partial<BrandIdentitySnapshotV1['generationRules']> = {},
  name = 'Kelder',
): BrandIdentitySnapshotV1 {
  return {
    schemaVersion: 1,
    organizationId: 'org',
    brandId: 'brand',
    revisionId: `revision-${name}`,
    revisionVersion: 3,
    approval: 'approved',
    resolvedAt: '2026-11-15T00:00:00.000Z',
    contentHash: hash,
    identity: { name },
    voice: {
      tone: 'Direct',
      audience: ['Founders'],
      values: ['Clarity'],
      messagingPillars: ['Useful'],
      avoid: ['Hype'],
    },
    generationRules: {
      schemaVersion: 1,
      evidence: [],
      facts: [],
      mandatory: [],
      avoid: [],
      palette: [],
      typography: [],
      assets: [],
      examples: [],
      ...overrides,
    },
    diagnostics: [],
  };
}

const kelder = snapshot({
  palette: [
    {
      id: 'p1',
      color: '#112233',
      usage: 'Primary',
      required: true,
      evidenceIds: [],
    },
    {
      id: 'p2',
      color: '#FFEEDD',
      usage: 'Background',
      required: false,
      evidenceIds: [],
    },
  ],
  typography: [
    {
      id: 't1',
      role: 'Headline',
      family: 'Kelder Display',
      weight: 700,
      style: 'normal',
      availability: 'owned_asset',
      required: true,
      evidenceIds: [],
    },
  ],
  assets: [
    {
      id: 'a1',
      assetId: 'logo-kelder',
      role: 'logo',
      required: true,
      mimeType: 'image/png',
      evidenceIds: [],
    },
  ],
});
const marlow = snapshot(
  {
    palette: [
      {
        id: 'p1',
        color: '#00AA55',
        usage: 'Primary',
        required: true,
        evidenceIds: [],
      },
    ],
    typography: [
      {
        id: 't1',
        role: 'Headline',
        family: 'Marlow Serif',
        weight: 400,
        style: 'italic',
        availability: 'verified_runtime',
        required: true,
        evidenceIds: [],
      },
    ],
    assets: [
      {
        id: 'a1',
        assetId: 'logo-marlow',
        role: 'logo',
        required: false,
        evidenceIds: [],
      },
    ],
  },
  'Marlow',
);

const base = { harnessBrief: '', skills: '', stagedAssetIds: [] as string[] };

describe('projectVisualBrandContext', () => {
  it('gives two brands different palette, type and logo for the same brief', () => {
    const a = projectVisualBrandContext({ ...base, snapshot: kelder });
    const b = projectVisualBrandContext({ ...base, snapshot: marlow });
    expect(a.paletteRoles).toEqual([
      { role: 'Primary', color: '#112233', isRequired: true },
      { role: 'Background', color: '#FFEEDD', isRequired: false },
    ]);
    expect(b.paletteRoles).toEqual([
      { role: 'Primary', color: '#00AA55', isRequired: true },
    ]);
    expect(a.typeRoles[0]).toMatchObject({
      family: 'Kelder Display',
      weight: 700,
    });
    expect(b.typeRoles[0]).toMatchObject({
      family: 'Marlow Serif',
      style: 'italic',
    });
    expect(a.logo.map((logo) => logo.assetId)).toEqual(['logo-kelder']);
    expect(b.logo.map((logo) => logo.assetId)).toEqual(['logo-marlow']);
  });

  it('names the revision the context was read from', () => {
    expect(
      projectVisualBrandContext({ ...base, snapshot: kelder }).revision,
    ).toEqual({ id: 'revision-Kelder', version: 3 });
  });

  it('marks a logo as staged only when the renderer stages it', () => {
    const staged = projectVisualBrandContext({
      ...base,
      snapshot: kelder,
      stagedAssetIds: ['logo-kelder'],
    });
    const notStaged = projectVisualBrandContext({ ...base, snapshot: kelder });
    expect(staged.logo[0].isStaged).toBe(true);
    expect(notStaged.logo[0].isStaged).toBe(false);
  });

  it('leaves out rules that apply to image or text only', () => {
    const context = projectVisualBrandContext({
      ...base,
      snapshot: snapshot({
        mandatory: [
          {
            id: 'm1',
            text: 'Show the product',
            match: 'semantic',
            required: true,
            evidenceIds: [],
            appliesToMediaKinds: ['video'],
          },
          {
            id: 'm2',
            text: 'End with a question',
            match: 'semantic',
            required: true,
            evidenceIds: [],
            appliesToMediaKinds: ['text'],
          },
          {
            id: 'm3',
            text: 'Use sentence case',
            match: 'semantic',
            required: true,
            evidenceIds: [],
          },
        ],
      }),
    });
    expect(context.mandatory).toEqual([
      'Show the product',
      'Use sentence case',
    ]);
  });

  it('passes a video section through once the snapshot carries one, and null before', () => {
    const video = { motionStyle: 'snappy' };
    const withVideo = snapshot();
    (withVideo.generationRules as unknown as { video: unknown }).video = video;
    expect(
      projectVisualBrandContext({ ...base, snapshot: withVideo }).videoIdentity,
    ).toEqual(video);
    expect(
      projectVisualBrandContext({ ...base, snapshot: kelder }).videoIdentity,
    ).toBeNull();
  });

  it('bounds the harness brief', () => {
    const context = projectVisualBrandContext({
      ...base,
      snapshot: kelder,
      harnessBrief: 'x'.repeat(VISUAL_BRAND_HARNESS_CHAR_LIMIT + 500),
    });
    expect(context.harnessBrief).toHaveLength(VISUAL_BRAND_HARNESS_CHAR_LIMIT);
  });
});
