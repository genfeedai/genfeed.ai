import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import {
  brandArtifactValidationReportV1Schema,
  brandRenderEvidenceManifestV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandRenderEvidenceFontV1,
  BrandRenderEvidenceManifestV1,
  BrandRenderEvidenceTextLayerV1,
  BrandRenderEvidenceVerificationV1,
} from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const service = new BrandValidationService();
const fontHash = `sha256:${'f'.repeat(64)}`;
const otherFontHash = `sha256:${'e'.repeat(64)}`;

type FontRule =
  BrandIdentitySnapshotV1['generationRules']['typography'][number];
const heading: FontRule = {
  availability: 'owned_asset',
  evidenceIds: ['evidence-a'],
  family: 'Brand Display',
  fontAssetReferenceId: 'font-asset',
  id: 'heading',
  required: true,
  role: 'heading',
  style: 'normal',
  weight: 700,
};
const body: FontRule = {
  availability: 'verified_runtime',
  evidenceIds: ['evidence-a'],
  family: 'Inter',
  id: 'body',
  required: true,
  role: 'body',
  runtimeFontId: 'inter-runtime',
  style: 'normal',
  weight: 400,
};

function snapshot(typography: FontRule[]): BrandIdentitySnapshotV1 {
  const value: BrandIdentitySnapshotV1 = {
    schemaVersion: 1,
    organizationId: 'org-a',
    brandId: 'brand-a',
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-01T00:00:00Z',
    contentHash: `sha256:${'0'.repeat(64)}`,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [{ id: 'evidence-a', sourceType: 'manual', label: 'Source' }],
      facts: [],
      palette: [],
      typography,
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [
        {
          assetId: 'font-asset-id',
          contentHash: fontHash,
          evidenceIds: ['evidence-a'],
          id: 'font-asset',
          required: true,
          role: 'font',
        },
      ],
    },
    diagnostics: [],
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}
async function png() {
  return new Uint8Array(
    await sharp({
      create: { background: '#123456', channels: 3, height: 200, width: 300 },
    })
      .png()
      .toBuffer(),
  );
}
function input(
  bytes: Uint8Array,
  typography: FontRule[],
): BrandArtifactValidationInputV1 {
  const parts = [
    {
      contentHash: hashBrandArtifactBytes(bytes),
      id: 'primary',
      role: 'primary' as const,
      version: 'v1',
    },
  ];
  return {
    snapshot: snapshot(typography),
    artifact: {
      kind: 'ingredient',
      id: 'ingredient-a',
      version: 'v1',
      mediaKind: 'image',
      parts,
      contentHash: hashBrandedGenerationArtifactManifestV1({
        mediaKind: 'image',
        textHash: null,
        parts,
      }),
    },
    material: {
      artifactKind: 'ingredient',
      artifactId: 'ingredient-a',
      artifactVersion: 'v1',
      textBytes: null,
      parts: [{ partId: 'primary', partVersion: 'v1', bytes }],
      references: [],
    },
  };
}

const displayFont: BrandRenderEvidenceFontV1 = {
  declaredFamily: 'Brand Display',
  family: 'Brand Display',
  glyphCount: 40,
  id: 'font-display',
  postScriptName: 'BrandDisplay-Bold',
  source: { assetId: 'font-asset-id', contentHash: fontHash, kind: 'asset' },
  style: 'normal',
  weight: 700,
};
const interFont: BrandRenderEvidenceFontV1 = {
  declaredFamily: null,
  family: 'Inter',
  glyphCount: 120,
  id: 'font-inter',
  postScriptName: 'Inter-Regular',
  source: { contentHash: null, kind: 'system' },
  style: 'normal',
  weight: 400,
};
const arialFont: BrandRenderEvidenceFontV1 = {
  ...interFont,
  family: 'Arial',
  id: 'font-arial',
  postScriptName: 'ArialMT',
};
function layer(
  id: string,
  usage: { fontId: string; glyphCount: number }[],
  text = 'Hello',
): BrandRenderEvidenceTextLayerV1 {
  return {
    bounds: { height: 20, width: 100, x: 0, y: 0 },
    color: { css: 'rgb(0, 0, 0)', hex: '#000000FF' },
    declaredFontFamily: 'Brand Display',
    fontSizePx: 24,
    fontUsage: usage,
    frame: 0,
    id,
    isTextTruncated: false,
    opacity: 1,
    requestedStyle: 'normal',
    requestedWeight: 700,
    text,
  };
}
function manifest(
  partHash: string,
  overrides: Partial<BrandRenderEvidenceManifestV1> = {},
): BrandRenderEvidenceManifestV1 {
  return brandRenderEvidenceManifestV1Schema.parse({
    schemaVersion: 1,
    kind: 'brand_render_evidence',
    id: 'manifest-a',
    organizationId: 'org-a',
    brandId: 'brand-a',
    capturedAt: '2026-10-11T10:00:00.000Z',
    artifact: {
      byteLength: 1000,
      contentHash: partHash,
      format: 'png',
      height: 200,
      id: 'ingredient-a',
      kind: 'ingredient',
      mediaKind: 'image',
      mimeType: 'image/png',
      storageKey: null,
      width: 300,
    },
    renderer: {
      engine: 'remotion-chromium',
      engineVersion: '4.0',
      fontReporting: 'chromium-cdp-platform-fonts',
      id: 'genfeed-visual-code',
      isolation: 'gvisor-runsc',
      version: '1',
    },
    brandSnapshot: { binding: 'unavailable', reasonCode: 'not_resolved' },
    coverage: { capturedFrames: [0], frameCount: 1, kind: 'complete' },
    fonts: [displayFont, interFont],
    textLayers: [
      layer('title', [{ fontId: 'font-display', glyphCount: 5 }]),
      layer('copy', [{ fontId: 'font-inter', glyphCount: 5 }]),
    ],
    fallbacks: [],
    placedAssets: [],
    diagnostics: [],
    contentHash: `sha256:${'1'.repeat(64)}`,
    ...overrides,
  });
}
const verified = (
  value: BrandRenderEvidenceManifestV1,
): BrandRenderEvidenceVerificationV1 => ({
  manifest: value,
  status: 'verified',
});

async function run(
  evidence: (partHash: string) => BrandRenderEvidenceVerificationV1 | undefined,
  typography: FontRule[] = [heading, body],
  edit: (value: BrandArtifactValidationInputV1) => void = () => undefined,
) {
  const bytes = await png();
  const value = input(bytes, typography);
  edit(value);
  const report = await service.validateBrandArtifact(value, {
    renderEvidence: evidence(hashBrandArtifactBytes(bytes)),
  });
  return { report, value };
}
const byId = (
  report: Awaited<ReturnType<typeof run>>['report'],
  ruleId: string,
) => report.checks.find((check) => check.ruleId === ruleId);

describe('font checks from a verified render manifest', () => {
  it('passes each approved font a layer was drawn with, with a proof bound to the manifest', async () => {
    const { report, value } = await run((hash) => verified(manifest(hash)));
    expect(
      brandArtifactValidationReportV1Schema.safeParse(report).success,
    ).toBe(true);
    expect(byId(report, 'heading')).toMatchObject({
      category: 'typography',
      method: 'deterministic_render',
      result: 'pass',
      proof: {
        algorithm: 'render-manifest-font-v1',
        artifactHash: value.artifact.contentHash,
        frame: 0,
        kind: 'font',
        manifestId: 'manifest-a',
        partHash: value.artifact.parts[0].contentHash,
        renderer: { id: 'genfeed-visual-code' },
        textLayers: 2,
        matchedFonts: [
          {
            family: 'Brand Display',
            fontId: 'font-display',
            sourceKind: 'asset',
          },
        ],
      },
    });
    expect(byId(report, 'body')).toMatchObject({
      result: 'pass',
      proof: { matchedFonts: [{ fontId: 'font-inter', sourceKind: 'system' }] },
    });
    // The font asset rule is matched by the hash of the font file the renderer loaded.
    expect(byId(report, 'font-asset')).toMatchObject({
      category: 'typography',
      result: 'pass',
    });
    expect(report.checks.at(-1)).toMatchObject({
      result: 'unknown',
      ruleId: 'system:factual_coverage',
    });
  });
  it('is not applied to a hard rule with no evidence read', async () => {
    const { report } = await run(() => undefined);
    expect(byId(report, 'heading')).toMatchObject({
      reasonCode: 'exact_font_unavailable',
      result: 'unsupported',
    });
  });
  it.each([
    [
      'missing evidence (a model-generated image has none)',
      { reasonCode: 'manifest_not_found', manifest: null, status: 'missing' },
      'render_evidence_missing',
    ],
    [
      'rejected evidence',
      {
        manifest: null,
        reasonCode: 'artifact_hash_mismatch',
        status: 'rejected',
      },
      'render_evidence_rejected',
    ],
  ] as const)('stays unknown for %s', async (_name, evidence, reason) => {
    const { report } = await run(() => evidence);
    for (const ruleId of ['heading', 'body', 'font-asset'])
      expect(byId(report, ruleId)).toMatchObject({
        reasonCode: reason,
        result: 'unknown',
      });
  });
  it.each([
    [
      'a manifest for other bytes',
      (hash: string) => manifest(hash, {}),
      (value: BrandRenderEvidenceManifestV1) => ({
        ...value,
        artifact: { ...value.artifact, contentHash: otherFontHash },
      }),
      'render_evidence_rejected',
    ],
    [
      'another brand',
      (hash: string) => manifest(hash, {}),
      (value: BrandRenderEvidenceManifestV1) => ({
        ...value,
        brandId: 'brand-b',
      }),
      'render_evidence_rejected',
    ],
    [
      'another organization',
      (hash: string) => manifest(hash, {}),
      (value: BrandRenderEvidenceManifestV1) => ({
        ...value,
        organizationId: 'org-b',
      }),
      'render_evidence_rejected',
    ],
    [
      'video-sampled coverage',
      (hash: string) =>
        manifest(hash, {
          coverage: {
            capturedFrames: [0, 12],
            frameCount: 24,
            kind: 'sampled_frames',
          },
          textLayers: [
            layer('title', [{ fontId: 'font-display', glyphCount: 5 }]),
          ],
        }),
      (value: BrandRenderEvidenceManifestV1) => value,
      'font_coverage_partial',
    ],
  ] as const)('stays unknown for %s', async (_name, build, tamper, reason) => {
    const { report } = await run((hash) => verified(tamper(build(hash))));
    expect(byId(report, 'heading')).toMatchObject({
      reasonCode: reason,
      result: 'unknown',
    });
    expect(byId(report, 'heading')).not.toHaveProperty('proof');
  });
  it('stays unknown when a text layer reports no font, uses a fallback or an unapproved font', async () => {
    const cases: [string, Partial<BrandRenderEvidenceManifestV1>, string][] = [
      [
        'unreported',
        {
          textLayers: [
            layer('title', [{ fontId: 'font-display', glyphCount: 5 }]),
            layer('copy', []),
          ],
        },
        'font_usage_unreported',
      ],
      [
        'fallback',
        {
          fallbacks: [
            {
              glyphCount: 5,
              layerId: 'copy',
              reason: 'family_unavailable',
              requestedFamily: 'Inter',
              usedFontId: 'font-inter',
            },
          ],
        },
        'font_fallback_used',
      ],
      [
        'unapproved',
        {
          fonts: [displayFont, interFont, arialFont],
          textLayers: [
            layer('title', [{ fontId: 'font-display', glyphCount: 5 }]),
            layer('copy', [{ fontId: 'font-arial', glyphCount: 5 }]),
          ],
        },
        'font_not_approved',
      ],
      [
        'no text',
        { textLayers: [layer('blank', [], '   ')] },
        'font_no_text_layers',
      ],
    ];
    for (const [, overrides, reason] of cases) {
      const { report } = await run((hash) =>
        verified(manifest(hash, overrides)),
      );
      for (const ruleId of ['heading', 'body'])
        expect(byId(report, ruleId)).toMatchObject({
          reasonCode: reason,
          result: 'unknown',
        });
    }
  });
  it('does not pass a rule whose own font drew nothing, and never fails', async () => {
    const { report } = await run((hash) =>
      verified(
        manifest(hash, {
          textLayers: [
            layer('title', [{ fontId: 'font-display', glyphCount: 5 }]),
          ],
        }),
      ),
    );
    expect(byId(report, 'heading')).toMatchObject({ result: 'pass' });
    expect(byId(report, 'body')).toMatchObject({
      reasonCode: 'font_not_used',
      result: 'unknown',
    });
  });
  it('requires the exact weight, style and owned font file', async () => {
    // The font file is approved by the asset rule, but the heading rule asks for weight 700.
    const lighter = { ...displayFont, weight: 400 as const };
    const { report: weight } = await run((hash) =>
      verified(manifest(hash, { fonts: [lighter, interFont] })),
    );
    expect(byId(weight, 'heading')).toMatchObject({
      reasonCode: 'font_not_used',
      result: 'unknown',
    });
    expect(byId(weight, 'font-asset')).toMatchObject({ result: 'pass' });
    const swapped = {
      ...displayFont,
      source: {
        assetId: 'font-asset-id',
        contentHash: otherFontHash,
        kind: 'asset' as const,
      },
    };
    const { report: file } = await run((hash) =>
      verified(manifest(hash, { fonts: [swapped, interFont] })),
    );
    expect(byId(file, 'heading')).toMatchObject({
      reasonCode: 'font_not_approved',
      result: 'unknown',
    });
    expect(byId(file, 'font-asset')).toMatchObject({ result: 'unknown' });
  });
  it('cannot recognize a font whose availability is unknown', async () => {
    const unproven: FontRule = { ...body, availability: 'unknown', id: 'body' };
    const { report } = await run(
      (hash) => verified(manifest(hash)),
      [heading, unproven],
    );
    // The body layer is drawn in a font no rule can vouch for.
    expect(byId(report, 'heading')).toMatchObject({
      reasonCode: 'font_not_approved',
      result: 'unknown',
    });
    expect(byId(report, 'body')).toMatchObject({ result: 'unknown' });
  });
  it('leaves a video unknown even with a manifest', async () => {
    const { report } = await run(
      (hash) => verified(manifest(hash)),
      [heading, body],
      (value) => {
        value.artifact.mediaKind = 'video';
        value.artifact.contentHash = hashBrandedGenerationArtifactManifestV1({
          mediaKind: 'video',
          parts: value.artifact.parts,
          textHash: null,
        });
      },
    );
    expect(byId(report, 'heading')).toMatchObject({ result: 'unknown' });
  });
});
