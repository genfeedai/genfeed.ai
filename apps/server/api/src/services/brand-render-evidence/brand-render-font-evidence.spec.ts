import {
  buildBrandRenderEvidenceManifest,
  verifyBrandRenderEvidenceManifest,
} from '@api/services/brand-render-evidence/brand-render-evidence-manifest.util';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { hashBrandArtifactBytes } from '@api/services/brand-validation/brand-validation-artifact.util';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandIdentitySnapshotV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import brandFontRender from '@api-test/fixtures/brand-render-evidence/visual-code-brand-font-still.fixture.json';
import type {
  BrandArtifactValidationInputV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it } from 'vitest';

/**
 * The observations in the fixture come from a real Chromium render of a still in
 * which every line of text uses a brand font that the API staged as an asset.
 * These specs carry them through the same manifest builder, storage check and
 * validator the product uses, to the font rule the brand approved.
 */
const png = Buffer.from(brandFontRender.png, 'base64');
const [stagedFont] = brandFontRender.evidence.assets;
const scope = { organizationId: 'org-a', brandId: 'brand-a' };

function manifestFor(authorizedAssetIds: string[]) {
  const built = buildBrandRenderEvidenceManifest({
    ...scope,
    artifact: {
      id: 'ingredient-a',
      storageKey: 'visual-code/org-a/brand-a/revision/outputs/0.png',
      format: 'png',
      width: brandFontRender.width,
      height: brandFontRender.height,
      frame: brandFontRender.frame,
    },
    authorizedAssetIds: new Set(authorizedAssetIds),
    brandSnapshot: { binding: 'unavailable', reasonCode: 'not_resolved' },
    bytes: png,
    capturedAt: new Date('2026-10-12T00:00:00Z'),
    observations: brandFontRender.evidence,
    rendererVersion: '4.0.530',
  });
  if (!built.manifest) throw new Error(`no manifest: ${built.reasonCode}`);
  return built.manifest;
}

function snapshot(): BrandIdentitySnapshotV1 {
  const value: BrandIdentitySnapshotV1 = {
    schemaVersion: 1,
    ...scope,
    revisionId: 'revision-a',
    revisionVersion: 1,
    approval: 'approved',
    resolvedAt: '2026-10-12T00:00:00Z',
    contentHash: `sha256:${'0'.repeat(64)}`,
    identity: { name: 'Example Co' },
    voice: { audience: [], values: [], messagingPillars: [], avoid: [] },
    generationRules: {
      schemaVersion: 1,
      evidence: [{ id: 'evidence-a', sourceType: 'manual', label: 'Source' }],
      facts: [],
      palette: [],
      typography: [
        {
          availability: 'owned_asset',
          evidenceIds: ['evidence-a'],
          family: 'Zodiak',
          fontAssetReferenceId: 'font-reference',
          id: 'heading',
          required: true,
          role: 'heading',
          style: 'normal',
          weight: 400,
        },
      ],
      mandatory: [],
      avoid: [],
      examples: [],
      assets: [
        {
          assetId: stagedFont.id,
          contentHash: stagedFont.contentHash,
          evidenceIds: ['evidence-a'],
          id: 'font-reference',
          mimeType: 'font/woff2',
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

function validationInput(): BrandArtifactValidationInputV1 {
  const parts = [
    {
      contentHash: hashBrandArtifactBytes(png),
      id: 'primary',
      role: 'primary' as const,
      version: 'v1',
    },
  ];
  return {
    snapshot: snapshot(),
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
      parts: [{ partId: 'primary', partVersion: 'v1', bytes: png }],
      references: [],
    },
  };
}

async function fontChecks(authorizedAssetIds: string[]) {
  const stored = manifestFor(authorizedAssetIds);
  const evidence = verifyBrandRenderEvidenceManifest(stored, {
    ...scope,
    artifactId: 'ingredient-a',
    bytes: png,
  });
  expect(evidence.status).toBe('verified');
  const report = await new BrandValidationService().validateBrandArtifact(
    validationInput(),
    { renderEvidence: evidence },
  );
  return {
    manifest: stored,
    heading: report.checks.find((check) => check.ruleId === 'heading'),
    fontAsset: report.checks.find((check) => check.ruleId === 'font-reference'),
  };
}

describe('a render in a staged brand font', () => {
  it('records the brand font as an asset with its id and hash', () => {
    const { fonts, textLayers, fallbacks } = manifestFor([stagedFont.id]);
    expect(fonts).toHaveLength(1);
    expect(fonts[0]).toMatchObject({
      family: 'Zodiak',
      declaredFamily: 'Zodiak',
      weight: 400,
      style: 'normal',
      source: {
        kind: 'asset',
        assetId: stagedFont.id,
        contentHash: stagedFont.contentHash,
      },
    });
    expect(fallbacks).toEqual([]);
    expect(textLayers).toHaveLength(2);
    for (const layer of textLayers)
      expect(layer.fontUsage.map((usage) => usage.fontId)).toEqual([
        fonts[0].id,
      ]);
  });

  it('passes the approved font rule for the still', async () => {
    const { heading, fontAsset, manifest } = await fontChecks([stagedFont.id]);
    expect(heading).toMatchObject({
      category: 'typography',
      method: 'deterministic_render',
      result: 'pass',
      proof: {
        algorithm: 'render-manifest-font-v1',
        manifestId: manifest.id,
        matchedFonts: [{ family: 'Zodiak', sourceKind: 'asset' }],
      },
    });
    expect(fontAsset).toMatchObject({ category: 'typography', result: 'pass' });
  });

  it('proves nothing when the asset was not one the API authorised for the render', async () => {
    const { manifest, heading } = await fontChecks(['another-asset']);
    expect(manifest.fonts[0].source).toEqual({
      kind: 'unknown',
      contentHash: null,
    });
    expect(heading).toMatchObject({ result: 'unknown' });
    expect(heading).not.toHaveProperty('proof');
  });
});
