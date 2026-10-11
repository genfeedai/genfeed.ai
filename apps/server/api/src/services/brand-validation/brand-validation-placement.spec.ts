import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  BRAND_PLACEMENT_MIN_DETECTION_SCORE,
  brandPixelSimilarity,
} from '@api/services/brand-validation/brand-validation-placement.util';
import type {
  BrandDetectedRegion,
  BrandDetectionOutcome,
  BrandDetectionRequest,
  BrandOcrOutcome,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { brandArtifactValidationReportV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const service = new BrandValidationService();
const identity = { id: 'replicate', model: 'acme/owl', version: 'v-owl' };

class FakeDetector implements BrandVisualAnalysis {
  readonly requests: BrandDetectionRequest[] = [];
  constructor(
    private readonly answer: (
      request: BrandDetectionRequest,
    ) => BrandDetectionOutcome,
  ) {}
  async detectRegions(
    request: BrandDetectionRequest,
  ): Promise<BrandDetectionOutcome> {
    this.requests.push(request);
    return this.answer(request);
  }
  async extractText(): Promise<BrandOcrOutcome> {
    return { status: 'unavailable' };
  }
}
const finds = (...regions: BrandDetectedRegion[][]) =>
  new FakeDetector((request) => ({
    frames: regions.length ? regions : request.frames.map(() => []),
    provider: identity,
    status: 'detected',
  }));

// A 64x64 mark with structure: a dark square with a bright diagonal bar.
async function mark() {
  const raw = Buffer.alloc(64 * 64 * 3, 30);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      if (Math.abs(x - y) < 8 || (x > 40 && y < 20))
        raw.fill(235, (y * 64 + x) * 3, (y * 64 + x) * 3 + 3);
  return new Uint8Array(
    await sharp(raw, { raw: { channels: 3, height: 64, width: 64 } })
      .png()
      .toBuffer(),
  );
}
async function scene(reference: Uint8Array, options: { scale?: number } = {}) {
  const size = Math.round(64 * (options.scale ?? 2));
  const placed = await sharp(Buffer.from(reference))
    .resize(size, size, { kernel: 'nearest' })
    .png()
    .toBuffer();
  return new Uint8Array(
    await sharp({
      create: { background: '#ffffff', channels: 3, height: 400, width: 600 },
    })
      .composite([{ input: placed, left: 400, top: 50 }])
      .png()
      .toBuffer(),
  );
}
const boxAround = (size = 128): BrandDetectedRegion['box'] => ({
  height: size / 400,
  width: size / 600,
  x: 400 / 600,
  y: 50 / 400,
});

function snapshot(
  assets: { id: string; role: 'logo' | 'product'; bytes: Uint8Array }[],
): BrandIdentitySnapshotV1 {
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
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: assets.map((asset) => ({
        id: asset.id,
        assetId: `${asset.id}-asset`,
        role: asset.role,
        contentHash: hashBrandArtifactBytes(asset.bytes),
        required: true,
        evidenceIds: ['evidence-a'],
      })),
    },
    diagnostics: [],
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}
type Part = BrandArtifactValidationInputV1['artifact']['parts'][number];
function input(
  bytes: Uint8Array,
  assets: { id: string; role: 'logo' | 'product'; bytes: Uint8Array }[],
  options: { withReferences?: boolean; overlay?: Uint8Array } = {},
): BrandArtifactValidationInputV1 {
  const parts: Part[] = [
    {
      id: 'primary',
      version: 'v1',
      role: 'primary',
      contentHash: hashBrandArtifactBytes(bytes),
    },
    ...(options.overlay
      ? [
          {
            id: 'overlay',
            version: 'v1',
            role: 'overlay' as const,
            contentHash: hashBrandArtifactBytes(options.overlay),
          },
        ]
      : []),
  ];
  return {
    snapshot: snapshot(assets),
    artifact: {
      kind: 'visual_export',
      id: 'artifact-a',
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
      artifactKind: 'visual_export',
      artifactId: 'artifact-a',
      artifactVersion: 'v1',
      textBytes: null,
      parts: [
        { partId: 'primary', partVersion: 'v1', bytes },
        ...(options.overlay
          ? [{ partId: 'overlay', partVersion: 'v1', bytes: options.overlay }]
          : []),
      ],
      references:
        options.withReferences === false
          ? []
          : assets.map((asset) => ({
              assetReferenceId: asset.id,
              assetId: `${asset.id}-asset`,
              bytes: asset.bytes,
            })),
    },
  };
}
const checkOf = async (
  value: BrandArtifactValidationInputV1,
  analysis: BrandVisualAnalysis | undefined,
  ruleId: string,
) =>
  (
    await service.validateBrandArtifact(value, { visualAnalysis: analysis })
  ).checks.find((check) => check.ruleId === ruleId);

describe('brandPixelSimilarity', () => {
  const a = Float64Array.from([0, 10, 20, 30, 40, 50]);
  it('is 1 for the same structure at another brightness and contrast', () => {
    expect(brandPixelSimilarity(a, a)).toBeCloseTo(1, 6);
    expect(
      brandPixelSimilarity(
        a,
        a.map((value) => value * 2 + 5),
      ),
    ).toBeCloseTo(1, 6);
  });
  it('is 0 for inverted or flat pixels', () => {
    expect(
      brandPixelSimilarity(
        a,
        a.map((value) => 50 - value),
      ),
    ).toBe(0);
    expect(brandPixelSimilarity(a, new Float64Array(6).fill(7))).toBe(0);
    expect(brandPixelSimilarity(a, new Float64Array(3))).toBe(0);
  });
});

describe('logo and product placement from detected regions', () => {
  it('passes a region that matches the approved logo, with a proof bound to the artifact and reference', async () => {
    const reference = await mark();
    const value = input(await scene(reference), [
      { bytes: reference, id: 'logo', role: 'logo' },
    ]);
    const detector = finds([{ box: boxAround(), score: 0.8 }]);
    const report = await service.validateBrandArtifact(value, {
      visualAnalysis: detector,
    });
    expect(
      brandArtifactValidationReportV1Schema.safeParse(report).success,
    ).toBe(true);
    const check = report.checks.find(
      (candidate) => candidate.ruleId === 'logo',
    );
    expect(check).toMatchObject({
      category: 'logo',
      method: 'deterministic_render',
      result: 'pass',
      severity: 'hard',
      proof: {
        algorithm: 'detect-then-match-v1',
        artifactHash: value.artifact.contentHash,
        kind: 'placement',
        partHash: value.artifact.parts[0].contentHash,
        provider: identity,
        query: 'logo',
        referenceAssetId: 'logo-asset',
        referenceHash: hashBrandArtifactBytes(reference),
        sampledFrames: 1,
      },
    });
    expect(check).not.toHaveProperty('reasonCode');
    if (check?.proof?.kind !== 'placement') throw new Error('proof');
    expect(check.proof.matches[0]).toMatchObject({ frame: 0, score: 0.8 });
    expect(check.proof.matches[0].similarity).toBeGreaterThan(0.9);
    expect(detector.requests).toHaveLength(1);
    expect(detector.requests[0]).toMatchObject({
      query: 'logo',
      scope: { brandId: 'brand-a', organizationId: 'org-a' },
    });
    // Factual coverage still keeps every media receipt in review.
    expect(report.checks.at(-1)).toMatchObject({
      result: 'unknown',
      ruleId: 'system:factual_coverage',
    });
  });
  it('matches the logo at another scale, and queries a product separately', async () => {
    const reference = await mark();
    const other = await sharp(Buffer.from(reference)).negate().png().toBuffer();
    const value = input(await scene(reference, { scale: 1.5 }), [
      { bytes: reference, id: 'logo', role: 'logo' },
      { bytes: new Uint8Array(other), id: 'product', role: 'product' },
    ]);
    const detector = finds([{ box: boxAround(96), score: 0.7 }]);
    const report = await service.validateBrandArtifact(value, {
      visualAnalysis: detector,
    });
    expect(detector.requests.map((request) => request.query)).toEqual([
      'logo',
      'product',
    ]);
    const byId = (ruleId: string) =>
      report.checks.find((check) => check.ruleId === ruleId);
    expect(byId('logo')).toMatchObject({ result: 'pass' });
    // The same region is not the (inverted) approved product.
    expect(byId('product')).toMatchObject({
      category: 'product_identity',
      reasonCode: 'placement_unmatched',
      result: 'unknown',
    });
  });
  it('never fails: nothing detected, a weak detection or a different region stays unknown', async () => {
    const reference = await mark();
    const value = input(await scene(reference), [
      { bytes: reference, id: 'logo', role: 'logo' },
    ]);
    expect(await checkOf(value, finds(), 'logo')).toMatchObject({
      reasonCode: 'placement_not_found',
      result: 'unknown',
    });
    expect(
      await checkOf(
        value,
        finds([
          {
            box: boxAround(),
            score: BRAND_PLACEMENT_MIN_DETECTION_SCORE - 0.01,
          },
        ]),
        'logo',
      ),
    ).toMatchObject({ reasonCode: 'placement_not_found', result: 'unknown' });
    const empty = { height: 0.2, width: 0.2, x: 0.05, y: 0.6 };
    expect(
      await checkOf(value, finds([{ box: empty, score: 0.9 }]), 'logo'),
    ).toMatchObject({ reasonCode: 'placement_unmatched', result: 'unknown' });
  });
  it.each([
    ['disabled', 'visual_analysis_disabled'],
    ['unavailable', 'visual_analysis_unavailable'],
  ] as const)(
    'stays unknown when the analysis is %s',
    async (status, reason) => {
      const reference = await mark();
      const value = input(await scene(reference), [
        { bytes: reference, id: 'logo', role: 'logo' },
      ]);
      expect(
        await checkOf(value, new FakeDetector(() => ({ status })), 'logo'),
      ).toMatchObject({ reasonCode: reason, result: 'unknown' });
    },
  );
  it('treats an answer for the wrong number of frames as unavailable', async () => {
    const reference = await mark();
    const value = input(await scene(reference), [
      { bytes: reference, id: 'logo', role: 'logo' },
    ]);
    const detector = finds([], []);
    expect(await checkOf(value, detector, 'logo')).toMatchObject({
      reasonCode: 'visual_analysis_unavailable',
      result: 'unknown',
    });
  });
  it('makes no call without the approved reference bytes', async () => {
    const reference = await mark();
    const detector = finds([{ box: boxAround(), score: 0.9 }]);
    const value = input(
      await scene(reference),
      [{ bytes: reference, id: 'logo', role: 'logo' }],
      { withReferences: false },
    );
    expect(await checkOf(value, detector, 'logo')).toMatchObject({
      reasonCode: 'reference_unavailable',
      result: 'unknown',
    });
    expect(detector.requests).toHaveLength(0);
  });
  it('makes no call for a composite or without a configured analysis', async () => {
    const reference = await mark();
    const assets = [{ bytes: reference, id: 'logo', role: 'logo' as const }];
    const detector = finds([{ box: boxAround(), score: 0.9 }]);
    const composite = input(await scene(reference), assets, {
      overlay: reference,
    });
    expect(await checkOf(composite, detector, 'logo')).toMatchObject({
      reasonCode: 'visual_composite_unproven',
      result: 'unknown',
    });
    expect(detector.requests).toHaveLength(0);
    expect(
      await checkOf(input(await scene(reference), assets), undefined, 'logo'),
    ).toMatchObject({
      reasonCode: 'exact_logo_unavailable',
      result: 'unsupported',
    });
  });
  it('makes no call for bytes no decoder can read', async () => {
    const reference = await mark();
    const detector = finds([{ box: boxAround(), score: 0.9 }]);
    const value = input(
      new Uint8Array(512).map((_, i) => (i * 7) % 251),
      [{ bytes: reference, id: 'logo', role: 'logo' }],
    );
    expect(await checkOf(value, detector, 'logo')).toMatchObject({
      reasonCode: 'artifact_undecodable',
      result: 'unknown',
    });
    expect(detector.requests).toHaveLength(0);
  });
});
