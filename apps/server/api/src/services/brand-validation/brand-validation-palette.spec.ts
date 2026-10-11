import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  brandDeltaE2000,
  brandRgbToLab,
  parseBrandHexColor,
} from '@api/services/brand-validation/brand-validation-color.util';
import {
  BRAND_PALETTE_MIN_PIXELS,
  measureBrandPalette,
} from '@api/services/brand-validation/brand-validation-palette.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandArtifactProofV1 } from '@genfeedai/contracts/api-types/contracts';
import { brandArtifactValidationReportV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

function paletteProof(check?: { proof?: BrandArtifactProofV1 }) {
  return check?.proof?.kind === 'palette' ? check.proof : undefined;
}
const service = new BrandValidationService();

describe('CIEDE2000', () => {
  // Reference pairs from Sharma, Wu and Dalal, "The CIEDE2000 Color-Difference Formula" (2005).
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
  ] as const)('matches the published value for %j and %j', (a, b, expected) => {
    expect(brandDeltaE2000(a, b)).toBeCloseTo(expected, 3);
    expect(brandDeltaE2000(b, a)).toBeCloseTo(expected, 3);
  });
  it('is zero for identical colors and large for opposite colors', () => {
    const blue = brandRgbToLab([18, 52, 86]);
    expect(brandDeltaE2000(blue, blue)).toBe(0);
    expect(
      brandDeltaE2000(blue, brandRgbToLab([255, 220, 40])),
    ).toBeGreaterThan(40);
  });
  it('parses only plain six digit colors', () => {
    expect(parseBrandHexColor('#123456')).toEqual([18, 52, 86]);
    expect(parseBrandHexColor('#12345678')).toBeNull();
    expect(parseBrandHexColor('123456')).toBeNull();
  });
});

describe('palette measurement', () => {
  function frame(width: number, height: number, color: number[]) {
    const rgba = new Uint8Array(width * height * 4);
    for (let offset = 0; offset < rgba.length; offset += 4)
      rgba.set(color, offset);
    return { height, rgba, width };
  }
  it('measures the dominant swatches and coverage deterministically', () => {
    const left = frame(64, 64, [18, 52, 86, 255]);
    const right = frame(64, 64, [255, 255, 255, 255]);
    const measurement = measureBrandPalette({
      decoder: 'test',
      frames: [left, left, left, right],
    });
    expect(measurement?.analyzedPixels).toBe(4 * 64 * 64);
    expect(measurement?.swatches).toEqual([
      { color: '#123456', share: 0.75 },
      { color: '#FFFFFF', share: 0.25 },
    ]);
    const target = brandRgbToLab([18, 52, 86]);
    expect(measurement?.measure(target).coverage).toBe(0.75);
    expect(measurement?.measure(target).nearestSwatchDeltaE).toBe(0);
  });
  it('ignores transparent pixels and refuses a too small sample', () => {
    expect(
      measureBrandPalette({
        decoder: 'test',
        frames: [frame(64, 64, [18, 52, 86, 0])],
      }),
    ).toBeNull();
    const side = Math.floor(Math.sqrt(BRAND_PALETTE_MIN_PIXELS)) - 1;
    expect(
      measureBrandPalette({
        decoder: 'test',
        frames: [frame(side, side, [18, 52, 86, 255])],
      }),
    ).toBeNull();
  });
});

function snapshot(
  palette: { id: string; color: string; required?: boolean }[],
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
      palette: palette.map((rule) => ({
        id: rule.id,
        color: rule.color,
        usage: 'background',
        required: rule.required ?? true,
        evidenceIds: ['evidence-a'],
      })),
      typography: [],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}
type Part = BrandArtifactValidationInputV1['artifact']['parts'][number];
function imageInput(
  bytes: Uint8Array,
  palette: { id: string; color: string; required?: boolean }[],
  extraParts: { role: Part['role']; bytes: Uint8Array }[] = [],
): BrandArtifactValidationInputV1 {
  const parts: Part[] = [
    {
      id: 'primary',
      version: 'v1',
      role: 'primary',
      contentHash: hashBrandArtifactBytes(bytes),
    },
    ...extraParts.map((part, index) => ({
      id: `extra-${index}`,
      version: 'v1',
      role: part.role,
      contentHash: hashBrandArtifactBytes(part.bytes),
    })),
  ];
  return {
    snapshot: snapshot(palette),
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
        ...extraParts.map((part, index) => ({
          partId: `extra-${index}`,
          partVersion: 'v1',
          bytes: part.bytes,
        })),
      ],
      references: [],
    },
  };
}
async function solid(
  width: number,
  height: number,
  background: string,
  format: 'png' | 'jpeg' = 'png',
) {
  const image = sharp({
    create: { background, channels: 3, height, width },
  });
  return new Uint8Array(
    await (format === 'png'
      ? image.png()
      : image.jpeg({ quality: 90 })
    ).toBuffer(),
  );
}
async function split(left: string, right: string) {
  // Three quarters left color, one quarter right color.
  const quarter = await sharp({
    create: { background: right, channels: 3, height: 128, width: 128 },
  })
    .png()
    .toBuffer();
  return new Uint8Array(
    await sharp({
      create: { background: left, channels: 3, height: 128, width: 512 },
    })
      .composite([{ input: quarter, left: 384, top: 0 }])
      .png()
      .toBuffer(),
  );
}
const check = async (input: BrandArtifactValidationInputV1, ruleId: string) =>
  (await service.validateBrandArtifact(input)).checks.find(
    (candidate) => candidate.ruleId === ruleId,
  );

describe('artifact-bound palette proof for images', () => {
  it('passes with measured evidence bound to the artifact and part hashes', async () => {
    const input = imageInput(await solid(128, 128, '#123456'), [
      { id: 'blue', color: '#123456' },
    ]);
    const report = await service.validateBrandArtifact(input);
    expect(
      brandArtifactValidationReportV1Schema.safeParse(report).success,
    ).toBe(true);
    expect(report.checks[0]).toMatchObject({
      category: 'palette',
      method: 'deterministic_render',
      result: 'pass',
      severity: 'hard',
      proof: {
        algorithm: 'ciede2000-presence-v1',
        analyzedPixels: 128 * 128,
        artifactHash: report.artifactHash,
        coverage: 1,
        kind: 'palette',
        maxDeltaE: 8,
        mediaKind: 'image',
        minCoverage: 0.01,
        nearestSwatchDeltaE: 0,
        partHash: hashBrandArtifactBytes(input.material.parts[0].bytes),
        partId: 'primary',
        partVersion: 'v1',
        sampledFrames: 1,
        swatches: [{ color: '#123456', share: 1 }],
        target: '#123456',
      },
    });
    // Factual coverage still prevents any ready receipt.
    expect(report.checks.at(-1)).toMatchObject({
      result: 'unknown',
      ruleId: 'system:factual_coverage',
    });
  });
  it('measures partial coverage and fails when the approved color is absent', async () => {
    const input = imageInput(await split('#123456', '#FFFFFF'), [
      { id: 'blue', color: '#123456' },
      { id: 'white', color: '#FFFFFF' },
      { id: 'red', color: '#FF0000' },
    ]);
    const report = await service.validateBrandArtifact(input);
    const [blue, white, red] = report.checks;
    expect(paletteProof(blue)?.coverage).toBe(0.75);
    expect(paletteProof(white)?.coverage).toBe(0.25);
    expect(blue.result).toBe('pass');
    expect(white.result).toBe('pass');
    expect(red).toMatchObject({
      reasonCode: 'palette_color_absent',
      result: 'fail',
      proof: { coverage: 0, target: '#FF0000' },
    });
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'brand_rule_failed', severity: 'error' }),
    );
  });
  it('treats a perceptually close color as present and a distant one as absent', async () => {
    const near = imageInput(await solid(128, 128, '#163A5C'), [
      { id: 'blue', color: '#123456' },
    ]);
    expect((await check(near, 'blue'))?.result).toBe('pass');
    const far = imageInput(await solid(128, 128, '#3A7A5C'), [
      { id: 'blue', color: '#123456' },
    ]);
    expect((await check(far, 'blue'))?.result).toBe('fail');
  });
  it('proves a lossy jpeg of the brand color', async () => {
    const input = imageInput(await solid(200, 200, '#C8102E', 'jpeg'), [
      { id: 'red', color: '#C8102E' },
    ]);
    expect((await check(input, 'red'))?.result).toBe('pass');
  });
  it('keeps a soft rule soft when it fails', async () => {
    const input = imageInput(await solid(128, 128, '#123456'), [
      { id: 'accent', color: '#FF0000', required: false },
    ]);
    expect(await check(input, 'accent')).toMatchObject({
      result: 'fail',
      severity: 'soft',
    });
  });
  it.each([
    [
      'random bytes',
      async () => new Uint8Array(512).map((_, i) => (i * 7) % 251),
    ],
    [
      'an svg',
      async () =>
        new TextEncoder().encode(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#123456"/></svg>',
        ),
    ],
  ])('leaves %s unknown, never pass or fail', async (_name, make) => {
    const bytes = await make();
    const result = await check(
      imageInput(bytes, [{ id: 'blue', color: '#123456' }]),
      'blue',
    );
    expect(result).toMatchObject({
      method: 'capability',
      reasonCode: 'artifact_undecodable',
      result: 'unknown',
    });
    expect(result).not.toHaveProperty('proof');
  });
  it('leaves a video that no decoder can read unknown, never pass or fail', async () => {
    const input = imageInput(
      new Uint8Array(512).map((_, i) => (i * 7) % 251),
      [{ id: 'blue', color: '#123456' }],
    );
    input.artifact.mediaKind = 'video';
    input.artifact.contentHash = hashBrandedGenerationArtifactManifestV1({
      mediaKind: 'video',
      textHash: null,
      parts: input.artifact.parts,
    });
    const result = await check(input, 'blue');
    expect(result).toMatchObject({
      reasonCode: 'artifact_undecodable',
      result: 'unknown',
    });
    expect(result).not.toHaveProperty('proof');
  });
  it('leaves a too small image unknown', async () => {
    const result = await check(
      imageInput(await solid(16, 16, '#123456'), [
        { id: 'blue', color: '#123456' },
      ]),
      'blue',
    );
    expect(result).toMatchObject({
      reasonCode: 'visual_too_small',
      result: 'unknown',
    });
  });
  it('leaves a composite unknown: the base image is not the final pixels', async () => {
    const base = await solid(128, 128, '#123456');
    const result = await check(
      imageInput(
        base,
        [{ id: 'blue', color: '#123456' }],
        [{ role: 'overlay', bytes: await solid(32, 32, '#FF0000') }],
      ),
      'blue',
    );
    expect(result).toMatchObject({
      reasonCode: 'visual_composite_unproven',
      result: 'unknown',
    });
  });
  it('leaves an artifact with two visuals unknown', async () => {
    const base = await solid(128, 128, '#123456');
    const result = await check(
      imageInput(
        base,
        [{ id: 'blue', color: '#123456' }],
        [{ role: 'image', bytes: await solid(128, 128, '#FF0000') }],
      ),
      'blue',
    );
    expect(result).toMatchObject({
      reasonCode: 'visual_part_unavailable',
      result: 'unknown',
    });
  });
  it('leaves a translucent palette color unknown', async () => {
    const input = imageInput(await solid(128, 128, '#123456'), [
      { id: 'blue', color: '#12345680' },
    ]);
    expect(await check(input, 'blue')).toMatchObject({
      reasonCode: 'palette_color_translucent',
      result: 'unknown',
    });
  });
  it('rejects bytes that do not match the bound part hash, so the proof cannot move to other bytes', async () => {
    const input = imageInput(await solid(128, 128, '#123456'), [
      { id: 'blue', color: '#123456' },
    ]);
    input.material.parts = [
      {
        partId: 'primary',
        partVersion: 'v1',
        bytes: await solid(128, 128, '#FF0000'),
      },
    ];
    await expect(service.validateBrandArtifact(input)).rejects.toThrowError(
      'brand_validation_artifact_hash_mismatch',
    );
  });
  it('produces the same proof for the same bytes', async () => {
    const bytes = await split('#123456', '#FFFFFF');
    const first = await service.validateBrandArtifact(
      imageInput(bytes, [{ id: 'blue', color: '#123456' }]),
    );
    const second = await service.validateBrandArtifact(
      imageInput(bytes, [{ id: 'blue', color: '#123456' }]),
    );
    expect(second.checks).toEqual(first.checks);
  });
  it('does not apply to a rule excluded from the medium', async () => {
    const input = imageInput(await solid(128, 128, '#123456'), [
      { id: 'blue', color: '#123456' },
    ]);
    input.snapshot.generationRules.palette[0].appliesToMediaKinds = ['video'];
    input.snapshot.contentHash = hashBrandIdentitySnapshotV1(input.snapshot);
    expect(await check(input, 'blue')).toMatchObject({
      reasonCode: 'rule_media_not_applicable',
      result: 'not_applicable',
    });
  });
});
