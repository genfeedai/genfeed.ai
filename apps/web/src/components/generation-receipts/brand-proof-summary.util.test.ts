import type {
  BrandArtifactProofV1,
  BrandFactClaimV1,
} from '@genfeedai/contracts/api-types/contracts';
import { describe, expect, it } from 'vitest';
import { summarizeBrandProof } from './brand-proof-summary.util';

const hash = `sha256:${'a'.repeat(64)}`;
const base = {
  artifactHash: hash,
  partHash: hash,
  partId: 'part',
  partVersion: 'v1',
};
const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}|${Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join(',')}`;

describe('summarizeBrandProof', () => {
  it('summarizes a palette measurement', () => {
    const proof: BrandArtifactProofV1 = {
      ...base,
      algorithm: 'ciede2000-presence-v1',
      analyzedPixels: 4096,
      coverage: 0.7525,
      decoder: 'sharp',
      kind: 'palette',
      maxDeltaE: 8,
      mediaKind: 'image',
      minCoverage: 0.01,
      nearestSwatchDeltaE: 1.2,
      sampledFrames: 1,
      swatches: [],
      target: '#123456',
    };
    expect(summarizeBrandProof(proof, t)).toBe(
      'proof.palette|coverage=75.3%,distance=1.2,frames=1,pixels=4096,target=#123456',
    );
  });
  it('summarizes an OCR read', () => {
    const proof: BrandArtifactProofV1 = {
      ...base,
      algorithm: 'ocr-literal-v1',
      decoder: 'sharp',
      frameTextHashes: [hash, hash, hash, hash],
      kind: 'ocr',
      matchedFrames: [1, 2],
      mediaKind: 'video',
      provider: { id: 'replicate', model: 'acme/ocr', version: 'v1' },
      sampledFrames: 4,
    };
    expect(summarizeBrandProof(proof, t)).toBe(
      'proof.ocr|frames=4,matched=2,model=acme/ocr',
    );
  });
  it('summarizes placement matches by the best similarity, whatever their order', () => {
    const proof: BrandArtifactProofV1 = {
      ...base,
      algorithm: 'detect-then-match-v1',
      decoder: 'sharp',
      kind: 'placement',
      matches: [
        {
          box: { height: 0.2, width: 0.2, x: 0.1, y: 0.1 },
          frame: 0,
          score: 0.8,
          similarity: 0.75,
        },
        {
          box: { height: 0.2, width: 0.2, x: 0.5, y: 0.5 },
          frame: 1,
          score: 0.6,
          similarity: 0.91,
        },
      ],
      mediaKind: 'image',
      minDetectionScore: 0.3,
      minSimilarity: 0.7,
      provider: { id: 'replicate', model: 'acme/owl', version: 'v1' },
      query: 'logo',
      referenceAssetId: 'asset',
      referenceHash: hash,
      sampledFrames: 1,
    };
    expect(summarizeBrandProof(proof, t)).toBe(
      'proof.placement|count=2,model=acme/owl,query=logo,similarity=91%',
    );
  });
  it('summarizes the fonts a manifest proved', () => {
    const proof: BrandArtifactProofV1 = {
      ...base,
      algorithm: 'render-manifest-font-v1',
      frame: 0,
      kind: 'font',
      manifestHash: hash,
      manifestId: 'manifest',
      matchedFonts: [
        {
          family: 'Brand Display',
          fontId: 'a',
          sourceKind: 'asset',
          style: 'normal',
          weight: 700,
        },
        {
          family: 'Inter',
          fontId: 'b',
          sourceKind: 'system',
          style: 'normal',
          weight: 400,
        },
      ],
      mediaKind: 'image',
      renderer: {
        engine: 'remotion-chromium',
        id: 'visual-code',
        version: '1',
      },
      textLayers: 3,
    };
    expect(summarizeBrandProof(proof, t)).toBe(
      'proof.font|fonts=Brand Display, Inter,layers=3,renderer=visual-code',
    );
  });
  describe('fact check', () => {
    const claim = (
      verdict: 'supported' | 'unverified' | 'contradicted',
      index: number,
    ): BrandFactClaimV1 => ({
      evidence:
        verdict === 'unverified'
          ? []
          : [
              {
                evidenceId: `fact:rule-${index}`,
                origin: 'brand_os',
                quote: 'Ships in two days',
                ruleId: `rule-${index}`,
              },
            ],
      id: `claim-${index}`,
      origin: 'text',
      source: 'ships in two days',
      text: 'The brand ships in two days',
      verdict,
    });
    const proofOf = (claims: BrandFactClaimV1[]): BrandArtifactProofV1 => ({
      algorithm: 'fact-check-v1',
      artifactHash: hash,
      claims,
      claimsHash: hash,
      isTextComplete: true,
      kind: 'fact',
      knowledgeVersions: [],
      mediaKind: 'text',
      models: ['judge'],
      snapshotHash: hash,
      textHash: hash,
    });
    it('counts the claims by verdict', () => {
      expect(
        summarizeBrandProof(
          proofOf([
            claim('supported', 1),
            claim('supported', 2),
            claim('unverified', 3),
            claim('contradicted', 4),
          ]),
          t,
        ),
      ).toBe('proof.fact|claims=4,contradicted=1,supported=2,unverified=1');
    });
    it('states plainly that no factual claims were found', () => {
      expect(summarizeBrandProof(proofOf([]), t)).toBe('proof.factNone|');
    });
  });
});
