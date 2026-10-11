import {
  type BuildBrandRenderEvidenceInput,
  buildBrandRenderEvidenceManifest,
  hashArtifactBytes,
  hashManifest,
  verifyBrandRenderEvidenceManifest,
} from '@api/services/brand-render-evidence/brand-render-evidence-manifest.util';
import {
  type VisualRenderObservations,
  visualRenderObservationsSchema,
} from '@api/services/brand-render-evidence/visual-render-observations.util';
import realRender from '@api-test/fixtures/brand-render-evidence/visual-code-still.fixture.json';
import type { BrandRenderEvidenceManifestV1 } from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';
import { describe, expect, it } from 'vitest';

// Observations and bytes from a real Remotion export (see the fixture's description).
const real = {
  ...realRender,
  evidence: visualRenderObservationsSchema.parse(realRender.evidence),
};
const bytes = Buffer.from(real.png, 'base64');
const snapshotHash = `sha256:${'c'.repeat(64)}`;

function input(
  overrides: Partial<BuildBrandRenderEvidenceInput> = {},
): BuildBrandRenderEvidenceInput {
  return {
    organizationId: 'org-1',
    brandId: 'brand-1',
    artifact: {
      id: 'ingredient-1',
      storageKey: 'visual-code/org-1/brand-1/revision-1/outputs/0.png',
      format: 'png',
      width: real.width,
      height: real.height,
      frame: real.frame,
    },
    bytes,
    observations: structuredClone(real.evidence),
    authorizedAssetIds: new Set(['zodiak-regular', 'logo-png']),
    rendererVersion: '4.0.530',
    brandSnapshot: {
      binding: 'approved_at_render',
      revisionId: 'revision-7',
      revisionVersion: 7,
      contentHash: snapshotHash,
    },
    capturedAt: new Date('2026-10-11T12:00:00.000Z'),
    ...overrides,
  };
}

function built(
  overrides: Partial<BuildBrandRenderEvidenceInput> = {},
): BrandRenderEvidenceManifestV1 {
  const result = buildBrandRenderEvidenceManifest(input(overrides));
  if (!result.manifest)
    throw new Error(`manifest omitted: ${result.reasonCode}`);
  return result.manifest;
}
function observations(
  edit: (value: VisualRenderObservations) => void,
): VisualRenderObservations {
  const value = structuredClone(real.evidence);
  edit(value);
  return value;
}

describe('buildBrandRenderEvidenceManifest from a real export', () => {
  it('binds the observations to the exact bytes and the brand revision', () => {
    const manifest = built();
    expect(manifest.artifact).toEqual({
      kind: 'ingredient',
      id: 'ingredient-1',
      storageKey: 'visual-code/org-1/brand-1/revision-1/outputs/0.png',
      mediaKind: 'image',
      format: 'png',
      mimeType: 'image/png',
      contentHash: hashArtifactBytes(bytes),
      byteLength: bytes.byteLength,
      width: 320,
      height: 256,
    });
    expect(manifest.brandSnapshot).toEqual({
      binding: 'approved_at_render',
      revisionId: 'revision-7',
      revisionVersion: 7,
      contentHash: snapshotHash,
    });
    expect(manifest.renderer).toMatchObject({
      id: 'genfeed-visual-code',
      version: '4.0.530',
      engine: 'remotion-chromium',
      engineVersion: expect.stringContaining('Chrome/'),
      fontReporting: 'chromium-cdp-platform-fonts',
    });
    expect(manifest.coverage).toEqual({
      kind: 'complete',
      capturedFrames: [2],
      frameCount: 6,
    });
    const { contentHash, ...body } = manifest;
    expect(contentHash).toBe(hashManifest(body));
  });

  it('records the font the engine actually used for the brand layer', () => {
    const manifest = built();
    const headline = manifest.textLayers.find(
      (layer) => layer.text === 'Brand headline',
    );
    expect(headline).toMatchObject({
      declaredFontFamily: 'ZodiakBrand, serif',
      color: { css: 'rgb(255, 204, 0)', hex: '#FFCC00FF' },
      fontSizePx: 44,
    });
    const used = manifest.fonts.find(
      (font) => font.id === headline?.fontUsage[0].fontId,
    );
    expect(used).toMatchObject({
      family: 'Zodiak',
      postScriptName: 'Zodiak-Regular',
      declaredFamily: 'ZodiakBrand',
      weight: 400,
      style: 'normal',
      source: {
        kind: 'asset',
        assetId: 'zodiak-regular',
        contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
    expect(
      manifest.fallbacks.some((fallback) => fallback.layerId === headline?.id),
    ).toBe(false);
  });

  it('shows the forced fallback as a fallback, not as the requested font', () => {
    const manifest = built();
    const fallbackLayer = manifest.textLayers.find(
      (layer) => layer.text === 'Fallback line',
    );
    expect(fallbackLayer?.declaredFontFamily).toBe(
      'NoSuchBrandFontXyz, sans-serif',
    );
    expect(manifest.fallbacks).toEqual([
      {
        layerId: fallbackLayer?.id,
        requestedFamily: 'NoSuchBrandFontXyz',
        usedFontId: fallbackLayer?.fontUsage[0].fontId,
        glyphCount: 13,
        reason: 'family_unavailable',
      },
    ]);
    const used = manifest.fonts.find(
      (font) => font.id === fallbackLayer?.fontUsage[0].fontId,
    );
    expect(used?.source).toEqual({ kind: 'system', contentHash: null });
    expect(used?.family).not.toBe('NoSuchBrandFontXyz');
  });

  it('records the placed asset with its loaded hash and transform', () => {
    const [logo] = built().placedAssets;
    expect(logo).toMatchObject({
      role: 'image',
      assetId: 'logo-png',
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      opacity: 0.5,
    });
    expect(logo.transform.matrix).toHaveLength(6);
    expect(logo.bounds.width).toBeGreaterThan(60);
  });

  it('never contains text the viewer could not see', () => {
    expect(built().textLayers.map((layer) => layer.text)).toEqual([
      'Brand headline',
      'Fallback line',
    ]);
  });

  it('is deterministic for the same inputs', () => {
    expect(built()).toEqual(built());
  });
});

describe('what stays unknown', () => {
  it('omits a manifest when there are no observations', () => {
    expect(
      buildBrandRenderEvidenceManifest(input({ observations: undefined }))
        .reasonCode,
    ).toBe('observations_missing');
    expect(
      buildBrandRenderEvidenceManifest(input({ observations: null }))
        .reasonCode,
    ).toBe('observations_missing');
  });

  it('omits a manifest for malformed or smuggled observations', () => {
    expect(
      buildBrandRenderEvidenceManifest(
        input({ observations: { schemaVersion: 1 } }),
      ).reasonCode,
    ).toBe('observations_invalid');
    expect(
      buildBrandRenderEvidenceManifest(
        input({
          observations: {
            ...structuredClone(real.evidence),
            isCompliant: true,
          },
        }),
      ).reasonCode,
    ).toBe('observations_invalid');
  });

  it.each([
    'evidence_capture_failed',
    'evidence_frames_missing',
    'evidence_hook_failed',
    'evidence_invalid',
  ])('omits a manifest when the renderer reports %s', (code) => {
    const result = buildBrandRenderEvidenceManifest(
      input({ observations: observations((v) => v.diagnostics.push(code)) }),
    );
    expect(result).toEqual({
      manifest: null,
      reasonCode: 'observations_incomplete',
    });
  });

  it('omits a manifest when no frame was inspected', () => {
    const result = buildBrandRenderEvidenceManifest(
      input({ observations: observations((v) => (v.captures = [])) }),
    );
    expect(result.reasonCode).toBe('observations_incomplete');
  });

  it('omits a still manifest observed at a different frame than the export', () => {
    const result = buildBrandRenderEvidenceManifest(
      input({
        artifact: { ...input().artifact, frame: 4 },
      }),
    );
    expect(result.reasonCode).toBe('observations_incomplete');
  });

  it('carries partial-inspection diagnostics instead of hiding them', () => {
    const manifest = built({
      observations: observations((v) =>
        v.diagnostics.push('nested_documents_not_inspected'),
      ),
    });
    expect(manifest.diagnostics).toEqual(['nested_documents_not_inspected']);
  });

  it('does not claim fonts for a layer the engine did not report', () => {
    const manifest = built({
      observations: observations((v) => {
        v.captures[0].textLayers[0].platformFonts = null;
      }),
    });
    expect(manifest.textLayers[0].fontUsage).toEqual([]);
    expect(manifest.diagnostics).toContain('font_engine_report_unavailable');
  });

  it('does not accept a font asset the API never staged for this render', () => {
    const manifest = built({ authorizedAssetIds: new Set(['logo-png']) });
    expect(
      manifest.fonts.find((font) => font.family === 'Zodiak')?.source,
    ).toEqual({ kind: 'unknown', contentHash: null });
  });

  it('leaves an unauthorised placed asset unresolved', () => {
    const [logo] = built({
      authorizedAssetIds: new Set(['zodiak-regular']),
    }).placedAssets;
    expect(logo.assetId).toBeNull();
    expect(logo.contentHash).toBeNull();
  });

  it('does not take a placed asset hash the runner could not tie to staged bytes', () => {
    const [logo] = built({
      observations: observations((v) => {
        v.captures[0].placedAssets[0].contentHash = `sha256:${'f'.repeat(64)}`;
      }),
    }).placedAssets;
    expect(logo.contentHash).toBeNull();
  });
});

describe('a video export', () => {
  it('is sampled coverage across the inspected frames', () => {
    const video = observations((v) => {
      v.captures = [0, 2, 5].map((frame) => ({
        ...structuredClone(real.evidence.captures[0]),
        frame,
      }));
    });
    const manifest = built({
      artifact: { ...input().artifact, format: 'mp4', frame: undefined },
      observations: video,
    });
    expect(manifest.coverage).toEqual({
      kind: 'sampled_frames',
      capturedFrames: [0, 2, 5],
      frameCount: 6,
    });
    expect(manifest.artifact).toMatchObject({
      mediaKind: 'video',
      mimeType: 'video/mp4',
    });
    expect(new Set(manifest.textLayers.map((layer) => layer.id)).size).toBe(
      manifest.textLayers.length,
    );
  });
});

describe('verifyBrandRenderEvidenceManifest', () => {
  const expected = {
    organizationId: 'org-1',
    brandId: 'brand-1',
    artifactId: 'ingredient-1',
    bytes,
  };

  it('accepts an intact manifest for the bytes it was made from', () => {
    const manifest = built();
    expect(verifyBrandRenderEvidenceManifest(manifest, expected)).toEqual({
      status: 'verified',
      manifest,
    });
  });

  it('accepts a manifest after a JSON round trip through storage', () => {
    const stored = JSON.parse(JSON.stringify(built()));
    expect(verifyBrandRenderEvidenceManifest(stored, expected).status).toBe(
      'verified',
    );
  });

  it('reports a missing manifest as missing, never as verified', () => {
    for (const stored of [undefined, null]) {
      expect(verifyBrandRenderEvidenceManifest(stored, expected)).toEqual({
        status: 'missing',
        manifest: null,
        reasonCode: 'manifest_not_found',
      });
    }
  });

  it('rejects a manifest whose artifact hash does not match the bytes', () => {
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] ^= 0xff;
    expect(
      verifyBrandRenderEvidenceManifest(built(), {
        ...expected,
        bytes: changed,
      }),
    ).toEqual({
      status: 'rejected',
      manifest: null,
      reasonCode: 'artifact_hash_mismatch',
    });
  });

  it('rejects a manifest for bytes of a different length', () => {
    expect(
      verifyBrandRenderEvidenceManifest(built(), {
        ...expected,
        bytes: Buffer.concat([bytes, Buffer.from([0])]),
      }).status,
    ).toBe('rejected');
  });

  it('rejects an edited manifest even when the artifact hash still matches', () => {
    const forged = structuredClone(built());
    forged.fonts[0].family = 'Inter';
    expect(verifyBrandRenderEvidenceManifest(forged, expected)).toEqual({
      status: 'rejected',
      manifest: null,
      reasonCode: 'manifest_hash_mismatch',
    });
  });

  it('rejects a manifest that claims another artifact hash with its own hash recomputed', () => {
    const swapped = structuredClone(built());
    swapped.artifact.contentHash = hashArtifactBytes(Buffer.from('other'));
    const { contentHash: _drop, ...body } = swapped;
    swapped.contentHash = hashManifest(body);
    expect(verifyBrandRenderEvidenceManifest(swapped, expected).status).toBe(
      'rejected',
    );
    expect(verifyBrandRenderEvidenceManifest(swapped, expected)).toMatchObject({
      reasonCode: 'artifact_hash_mismatch',
    });
  });

  it('rejects another tenant or brand', () => {
    expect(
      verifyBrandRenderEvidenceManifest(built(), {
        ...expected,
        organizationId: 'org-2',
      }),
    ).toMatchObject({ reasonCode: 'scope_mismatch' });
    expect(
      verifyBrandRenderEvidenceManifest(built(), {
        ...expected,
        brandId: 'brand-2',
      }),
    ).toMatchObject({ reasonCode: 'scope_mismatch' });
  });

  it('rejects another artifact', () => {
    expect(
      verifyBrandRenderEvidenceManifest(built(), {
        ...expected,
        artifactId: 'ingredient-2',
      }),
    ).toMatchObject({ reasonCode: 'artifact_identity_mismatch' });
  });

  it('rejects anything that is not a manifest', () => {
    for (const stored of ['text', 7, {}, { schemaVersion: 1 }, []]) {
      expect(verifyBrandRenderEvidenceManifest(stored, expected)).toEqual({
        status: 'rejected',
        manifest: null,
        reasonCode: 'manifest_invalid',
      });
    }
  });
});
