import { describe, expect, it } from 'vitest';
import {
  type BrandRenderEvidenceManifestV1,
  brandRenderEvidenceCoverageV1Schema,
  brandRenderEvidenceFontSourceV1Schema,
  brandRenderEvidenceManifestV1Schema,
  brandRenderEvidenceSnapshotV1Schema,
} from './brand-render-evidence.contract';

const hash = `sha256:${'a'.repeat(64)}`;
const otherHash = `sha256:${'b'.repeat(64)}`;
const time = '2026-10-11T00:00:00.000Z';

function manifest(): BrandRenderEvidenceManifestV1 {
  return {
    schemaVersion: 1,
    kind: 'brand_render_evidence',
    id: 'manifest-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    capturedAt: time,
    artifact: {
      kind: 'ingredient',
      id: 'ingredient-1',
      storageKey: 'visual-code/org-1/brand-1/rev-1/outputs/0.png',
      mediaKind: 'image',
      format: 'png',
      mimeType: 'image/png',
      contentHash: hash,
      byteLength: 1024,
      width: 1080,
      height: 1080,
    },
    renderer: {
      id: 'genfeed-visual-code',
      version: '4.0.530',
      engine: 'remotion-chromium',
      engineVersion: 'Chrome/130.0.0.0',
      fontReporting: 'chromium-cdp-platform-fonts',
      isolation: 'gvisor-runsc',
    },
    brandSnapshot: {
      binding: 'approved_at_render',
      revisionId: 'revision-1',
      revisionVersion: 3,
      contentHash: otherHash,
    },
    coverage: { kind: 'complete', capturedFrames: [0], frameCount: 1 },
    fonts: [
      {
        id: 'font-1',
        family: 'DejaVu Sans',
        postScriptName: 'DejaVuSans',
        declaredFamily: null,
        weight: null,
        style: null,
        source: { kind: 'system', contentHash: null },
        glyphCount: 12,
      },
    ],
    textLayers: [
      {
        id: 'layer-1',
        frame: 0,
        text: 'Hello brand',
        isTextTruncated: false,
        bounds: { x: 10, y: 20, width: 300, height: 48 },
        declaredFontFamily: 'Inter, sans-serif',
        fontSizePx: 48,
        requestedWeight: 700,
        requestedStyle: 'normal',
        color: { css: 'rgb(255, 255, 255)', hex: '#FFFFFFFF' },
        opacity: 1,
        fontUsage: [{ fontId: 'font-1', glyphCount: 12 }],
      },
    ],
    fallbacks: [
      {
        layerId: 'layer-1',
        requestedFamily: 'Inter',
        usedFontId: 'font-1',
        glyphCount: 12,
        reason: 'family_unavailable',
      },
    ],
    placedAssets: [
      {
        id: 'placed-1',
        frame: 0,
        role: 'image',
        assetId: 'asset-1',
        contentHash: otherHash,
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        transform: { css: 'none', matrix: null },
        opacity: 1,
      },
    ],
    diagnostics: [],
    contentHash: otherHash,
  };
}

describe('brandRenderEvidenceManifestV1Schema', () => {
  it('accepts a manifest that records a system fallback font', () => {
    expect(
      brandRenderEvidenceManifestV1Schema.safeParse(manifest()).success,
    ).toBe(true);
  });

  it('rejects unknown fields so a manifest cannot smuggle claims', () => {
    expect(
      brandRenderEvidenceManifestV1Schema.safeParse({
        ...manifest(),
        isBrandCompliant: true,
      }).success,
    ).toBe(false);
  });

  it('requires a sha256-prefixed artifact hash', () => {
    const value = manifest();
    value.artifact.contentHash = 'a'.repeat(64);
    expect(brandRenderEvidenceManifestV1Schema.safeParse(value).success).toBe(
      false,
    );
  });

  it('rejects a text layer that uses an unlisted font', () => {
    const value = manifest();
    value.textLayers[0].fontUsage = [{ fontId: 'missing', glyphCount: 1 }];
    expect(brandRenderEvidenceManifestV1Schema.safeParse(value).success).toBe(
      false,
    );
  });

  it('rejects a fallback that names an unlisted layer', () => {
    const value = manifest();
    value.fallbacks[0].layerId = 'missing';
    expect(brandRenderEvidenceManifestV1Schema.safeParse(value).success).toBe(
      false,
    );
  });

  it('rejects layers and assets outside the captured frames', () => {
    const value = manifest();
    value.textLayers[0].frame = 5;
    expect(brandRenderEvidenceManifestV1Schema.safeParse(value).success).toBe(
      false,
    );
    const asset = manifest();
    asset.placedAssets[0].frame = 5;
    expect(brandRenderEvidenceManifestV1Schema.safeParse(asset).success).toBe(
      false,
    );
  });

  it('rejects duplicate layer IDs', () => {
    const value = manifest();
    value.textLayers.push({ ...value.textLayers[0] });
    expect(brandRenderEvidenceManifestV1Schema.safeParse(value).success).toBe(
      false,
    );
  });
});

describe('render evidence parts', () => {
  it('does not accept a system font that claims a content hash', () => {
    expect(
      brandRenderEvidenceFontSourceV1Schema.safeParse({
        kind: 'system',
        contentHash: hash,
      }).success,
    ).toBe(false);
  });

  it('binds an owned font asset to its hash', () => {
    expect(
      brandRenderEvidenceFontSourceV1Schema.safeParse({
        kind: 'asset',
        assetId: 'asset-1',
      }).success,
    ).toBe(false);
    expect(
      brandRenderEvidenceFontSourceV1Schema.safeParse({
        kind: 'asset',
        assetId: 'asset-1',
        contentHash: hash,
      }).success,
    ).toBe(true);
  });

  it('keeps a missing brand snapshot explicit', () => {
    expect(
      brandRenderEvidenceSnapshotV1Schema.safeParse({
        binding: 'unavailable',
        reasonCode: 'brand_identity_unavailable',
      }).success,
    ).toBe(true);
    expect(
      brandRenderEvidenceSnapshotV1Schema.safeParse({
        binding: 'approved_at_render',
        revisionId: 'revision-1',
      }).success,
    ).toBe(false);
  });

  it('allows complete coverage only for a single frame', () => {
    expect(
      brandRenderEvidenceCoverageV1Schema.safeParse({
        kind: 'complete',
        capturedFrames: [0, 1],
        frameCount: 2,
      }).success,
    ).toBe(false);
    expect(
      brandRenderEvidenceCoverageV1Schema.safeParse({
        kind: 'sampled_frames',
        capturedFrames: [0, 14, 29],
        frameCount: 30,
      }).success,
    ).toBe(true);
  });
});
