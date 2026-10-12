import { readFile } from 'node:fs/promises';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import { isBrandVideoDecoderAvailable } from '@api/services/brand-validation/brand-validation-pixels.util';
import type {
  BrandDetectionOutcome,
  BrandOcrOutcome,
  BrandOcrRequest,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
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
const hasVideoDecoder = await isBrandVideoDecoderAvailable();
const identity = { id: 'replicate', model: 'acme/ocr', version: 'v-abc' };

class FakeAnalysis implements BrandVisualAnalysis {
  readonly requests: BrandOcrRequest[] = [];
  constructor(
    private readonly answer: (request: BrandOcrRequest) => BrandOcrOutcome,
  ) {}
  async extractText(request: BrandOcrRequest): Promise<BrandOcrOutcome> {
    this.requests.push(request);
    return this.answer(request);
  }
  async detectRegions(): Promise<BrandDetectionOutcome> {
    return { status: 'unavailable' };
  }
}
const reads = (...texts: string[]) =>
  new FakeAnalysis(() => ({ provider: identity, status: 'read', texts }));

function snapshot(): BrandIdentitySnapshotV1 {
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
      mandatory: [
        {
          id: 'name',
          text: 'Example Co',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence-a'],
        },
        {
          id: 'tagline',
          text: 'Made simple',
          match: 'literal',
          required: false,
          evidenceIds: ['evidence-a'],
        },
        {
          id: 'meaning',
          text: 'Feels friendly',
          match: 'semantic',
          required: true,
          evidenceIds: ['evidence-a'],
        },
      ],
      avoid: [
        {
          id: 'returns',
          text: 'Guaranteed returns',
          match: 'literal',
          required: true,
          evidenceIds: ['evidence-a'],
        },
      ],
      examples: [],
      assets: [],
    },
    diagnostics: [],
  };
  value.contentHash = hashBrandIdentitySnapshotV1(value);
  return value;
}
type Part = BrandArtifactValidationInputV1['artifact']['parts'][number];
function input(
  bytes: Uint8Array,
  options: {
    mediaKind?: 'image' | 'video';
    extraParts?: { role: Part['role']; bytes: Uint8Array }[];
  } = {},
): BrandArtifactValidationInputV1 {
  const mediaKind = options.mediaKind ?? 'image';
  const extra = options.extraParts ?? [];
  const parts: Part[] = [
    {
      id: 'primary',
      version: 'v1',
      role: mediaKind === 'video' ? 'video' : 'primary',
      contentHash: hashBrandArtifactBytes(bytes),
    },
    ...extra.map((part, index) => ({
      id: `extra-${index}`,
      version: 'v1',
      role: part.role,
      contentHash: hashBrandArtifactBytes(part.bytes),
    })),
  ];
  return {
    snapshot: snapshot(),
    artifact: {
      kind: 'visual_export',
      id: 'artifact-a',
      version: 'v1',
      mediaKind,
      parts,
      contentHash: hashBrandedGenerationArtifactManifestV1({
        mediaKind,
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
        ...extra.map((part, index) => ({
          partId: `extra-${index}`,
          partVersion: 'v1',
          bytes: part.bytes,
        })),
      ],
      references: [],
    },
  };
}
const png = async (width = 600, height = 400) =>
  new Uint8Array(
    await sharp({
      create: { background: '#123456', channels: 3, height, width },
    })
      .png()
      .toBuffer(),
  );
const checkOf = async (
  value: BrandArtifactValidationInputV1,
  analysis: BrandVisualAnalysis | undefined,
  ruleId: string,
) =>
  (
    await service.validateBrandArtifact(value, { visualAnalysis: analysis })
  ).checks.find((check) => check.ruleId === ruleId);

describe('OCR literal checks for images and video', () => {
  it('passes a mandatory literal read in the pixels, with a proof bound to the artifact', async () => {
    const value = input(await png());
    const analysis = reads('SALE\r\nExample Co - open today');
    const report = await service.validateBrandArtifact(value, {
      visualAnalysis: analysis,
    });
    expect(
      brandArtifactValidationReportV1Schema.safeParse(report).success,
    ).toBe(true);
    const check = report.checks.find(
      (candidate) => candidate.ruleId === 'name',
    );
    expect(check).toMatchObject({
      category: 'mandatory_rule',
      method: 'deterministic_render',
      result: 'pass',
      severity: 'hard',
      proof: {
        algorithm: 'ocr-literal-v1',
        artifactHash: value.artifact.contentHash,
        kind: 'ocr',
        matchedFrames: [0],
        mediaKind: 'image',
        partHash: value.artifact.parts[0].contentHash,
        partId: 'primary',
        provider: identity,
        sampledFrames: 1,
      },
    });
    expect(check?.proof).toMatchObject({
      frameTextHashes: [
        hashBrandedGenerationTextV1('SALE\nExample Co - open today'),
      ],
    });
    expect(check).not.toHaveProperty('reasonCode');
    // Factual coverage still keeps every media receipt in review.
    expect(report.checks.at(-1)).toMatchObject({
      result: 'unknown',
      ruleId: 'system:factual_coverage',
    });
  });
  it('hands the model a legible PNG bounded to 1280 px, attributed to the snapshot scope', async () => {
    const analysis = reads('Example Co');
    await checkOf(input(await png(2400, 1200)), analysis, 'name');
    expect(analysis.requests).toHaveLength(1);
    expect(analysis.requests[0].scope).toEqual({
      brandId: 'brand-a',
      organizationId: 'org-a',
    });
    const metadata = await sharp(
      Buffer.from(analysis.requests[0].frames[0]),
    ).metadata();
    expect(metadata).toMatchObject({ format: 'png', height: 640, width: 1280 });
  });
  it('fails an avoid literal that is read, and keeps a soft rule soft', async () => {
    const value = input(await png());
    const report = await service.validateBrandArtifact(value, {
      visualAnalysis: reads('Example Co: Guaranteed returns, Made simple'),
    });
    expect(
      report.checks.find((check) => check.ruleId === 'returns'),
    ).toMatchObject({
      reasonCode: 'forbidden_literal_present',
      result: 'fail',
      severity: 'hard',
      proof: { kind: 'ocr', matchedFrames: [0] },
    });
    expect(
      report.checks.find((check) => check.ruleId === 'tagline'),
    ).toMatchObject({ result: 'pass', severity: 'soft' });
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'brand_rule_failed' }),
    );
  });
  it('never turns an unread literal into a pass or a fail', async () => {
    const value = input(await png());
    const report = await service.validateBrandArtifact(value, {
      visualAnalysis: reads('Something else entirely'),
    });
    const byId = (ruleId: string) =>
      report.checks.find((check) => check.ruleId === ruleId);
    expect(byId('name')).toMatchObject({
      reasonCode: 'ocr_literal_not_found',
      result: 'unknown',
    });
    expect(byId('returns')).toMatchObject({
      reasonCode: 'ocr_absence_unproven',
      result: 'unknown',
    });
    expect(byId('name')).not.toHaveProperty('proof');
    // A semantic rule is not a literal and stays with its own reason.
    expect(byId('meaning')).toMatchObject({
      reasonCode: 'semantic_validation_unavailable',
      result: 'unknown',
    });
  });
  it.each([
    ['a different case', 'example co'],
    ['extra inner spacing', 'Example  Co'],
  ])('matches exactly: %s does not pass', async (_name, text) => {
    expect(
      (await checkOf(input(await png()), reads(text), 'name'))?.result,
    ).toBe('unknown');
  });
  it('does not pass on a partial literal', async () => {
    expect(
      (await checkOf(input(await png()), reads('Example'), 'name'))?.result,
    ).toBe('unknown');
  });
  it.each([
    ['disabled', 'visual_analysis_disabled'],
    ['pending', 'visual_analysis_pending'],
    ['unavailable', 'visual_analysis_unavailable'],
  ] as const)(
    'stays unknown when the analysis is %s',
    async (status, reason) => {
      const analysis = new FakeAnalysis(() => ({ status }));
      const report = await service.validateBrandArtifact(input(await png()), {
        visualAnalysis: analysis,
      });
      expect(analysis.requests).toHaveLength(1);
      for (const ruleId of ['name', 'tagline', 'returns'])
        expect(
          report.checks.find((check) => check.ruleId === ruleId),
        ).toMatchObject({ reasonCode: reason, result: 'unknown' });
    },
  );
  it('treats an answer with the wrong number of texts as unavailable', async () => {
    expect(
      await checkOf(input(await png()), reads('Example Co', 'extra'), 'name'),
    ).toMatchObject({
      reasonCode: 'visual_analysis_unavailable',
      result: 'unknown',
    });
  });
  it('makes no call without a configured analysis, and leaves the text-coverage reason', async () => {
    expect(await checkOf(input(await png()), undefined, 'name')).toMatchObject({
      reasonCode: 'text_coverage_incomplete',
      result: 'unknown',
    });
  });
  it('makes no call when nothing is readable', async () => {
    const value = input(await png());
    value.snapshot.generationRules.mandatory = [
      value.snapshot.generationRules.mandatory[2],
    ];
    value.snapshot.generationRules.avoid = [];
    value.snapshot.contentHash = hashBrandIdentitySnapshotV1(value.snapshot);
    const analysis = reads('Example Co');
    await service.validateBrandArtifact(value, { visualAnalysis: analysis });
    expect(analysis.requests).toHaveLength(0);
  });
  it('makes no call for bytes no decoder can read', async () => {
    const analysis = reads('Example Co');
    const value = input(new Uint8Array(512).map((_, i) => (i * 7) % 251));
    expect(await checkOf(value, analysis, 'name')).toMatchObject({
      reasonCode: 'artifact_undecodable',
      result: 'unknown',
    });
    expect(analysis.requests).toHaveLength(0);
  });
  it('makes no call for a composite: the base is not the final pixels', async () => {
    const analysis = reads('Example Co');
    const value = input(await png(), {
      extraParts: [{ role: 'overlay', bytes: await png(64, 64) }],
    });
    expect(await checkOf(value, analysis, 'name')).toMatchObject({
      reasonCode: 'visual_composite_unproven',
      result: 'unknown',
    });
    expect(analysis.requests).toHaveLength(0);
  });
  (hasVideoDecoder ? it : it.skip)(
    'reads sampled frames of a real video and matches per frame',
    async () => {
      const bytes = new Uint8Array(
        await readFile(new URL('./fixtures/sample.mp4', import.meta.url)),
      );
      const value = input(bytes, { mediaKind: 'video' });
      const analysis = reads('', 'welcome to Example Co', '', '');
      const report = await service.validateBrandArtifact(value, {
        visualAnalysis: analysis,
      });
      expect(analysis.requests[0].frames).toHaveLength(4);
      for (const frame of analysis.requests[0].frames)
        expect((await sharp(Buffer.from(frame)).metadata()).format).toBe('png');
      expect(
        report.checks.find((check) => check.ruleId === 'name'),
      ).toMatchObject({
        result: 'pass',
        proof: {
          mediaKind: 'video',
          matchedFrames: [1],
          sampledFrames: 4,
        },
      });
    },
  );
  (hasVideoDecoder ? it : it.skip)(
    'does not join a literal split across two frames',
    async () => {
      const bytes = new Uint8Array(
        await readFile(new URL('./fixtures/sample.mp4', import.meta.url)),
      );
      expect(
        (
          await checkOf(
            input(bytes, { mediaKind: 'video' }),
            reads('Exam', 'ple Co', '', ''),
            'name',
          )
        )?.result,
      ).toBe('unknown');
    },
  );
});
