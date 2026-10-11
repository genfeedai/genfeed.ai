import { createHash } from 'node:crypto';
import { FontRegistry } from '@api/services/brand-render-evidence/brand-render-fonts.util';
import {
  type VisualRenderObservations,
  visualRenderObservationsSchema,
} from '@api/services/brand-render-evidence/visual-render-observations.util';
import { brandRenderEvidenceManifestV1Schema } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandRenderEvidenceCoverageV1,
  BrandRenderEvidenceManifestV1,
  BrandRenderEvidencePlacedAssetV1,
  BrandRenderEvidenceSnapshotV1,
  BrandRenderEvidenceTextLayerV1,
  BrandRenderEvidenceVerificationV1,
} from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';
import { sha256Hex, stableStringify } from '@libs/utils/canonical-hash.util';

export const VISUAL_CODE_RENDERER_ID = 'genfeed-visual-code';

/** Diagnostics from the renderer that mean it could not observe the export. */
const BLOCKING_DIAGNOSTICS = new Set([
  'evidence_capture_failed',
  'evidence_frames_missing',
  'evidence_hook_failed',
  'evidence_invalid',
  'snapshot_empty',
]);

export type BrandRenderEvidenceOmissionReason =
  | 'observations_missing'
  | 'observations_invalid'
  | 'observations_incomplete'
  | 'manifest_invalid';

export type BrandRenderEvidenceBuild =
  | { manifest: BrandRenderEvidenceManifestV1; reasonCode: null }
  | { manifest: null; reasonCode: BrandRenderEvidenceOmissionReason };

export interface BuildBrandRenderEvidenceInput {
  organizationId: string;
  brandId: string;
  artifact: {
    id: string;
    storageKey: string | null;
    format: 'png' | 'jpeg' | 'mp4';
    width: number;
    height: number;
    /** Composition frame a still was rendered from. */
    frame?: number;
  };
  /** The exact bytes that are stored as the artifact. */
  bytes: Uint8Array;
  /** The renderer's observations, untrusted until parsed. */
  observations: unknown;
  /** Staged asset IDs the API authorised for this render. */
  authorizedAssetIds: ReadonlySet<string>;
  rendererVersion: string;
  brandSnapshot: BrandRenderEvidenceSnapshotV1;
  capturedAt: Date;
}

export function hashArtifactBytes(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function hashManifest(
  manifest: Omit<BrandRenderEvidenceManifestV1, 'contentHash'>,
): string {
  return `sha256:${sha256Hex(`brand-render-evidence-v1\n${stableStringify(manifest)}`)}`;
}

function matrixOf(
  transform: string,
): [number, number, number, number, number, number] | null {
  const match = /^matrix\(([^)]*)\)$/.exec(transform.trim());
  if (!match) return null;
  const values = match[1].split(',').map((part) => Number(part.trim()));
  return values.length === 6 && values.every(Number.isFinite)
    ? [values[0], values[1], values[2], values[3], values[4], values[5]]
    : null;
}

function mediaKind(format: 'png' | 'jpeg' | 'mp4') {
  return format === 'mp4' ? 'video' : 'image';
}

function coverageOf(
  input: BuildBrandRenderEvidenceInput,
  observations: VisualRenderObservations,
): BrandRenderEvidenceCoverageV1 | null {
  const frames = observations.captures.map((capture) => capture.frame);
  if (frames.length === 0) return null;
  if (input.artifact.format === 'mp4')
    return {
      kind: 'sampled_frames',
      capturedFrames: frames,
      frameCount: observations.frameCount,
    };
  const { frame } = input.artifact;
  return frames.length === 1 && (frame === undefined || frames[0] === frame)
    ? {
        kind: 'complete',
        capturedFrames: frames,
        frameCount: observations.frameCount,
      }
    : null;
}

function placedAssetsOf(
  capture: VisualRenderObservations['captures'][number],
  staged: ReadonlyMap<string, string>,
): BrandRenderEvidencePlacedAssetV1[] {
  return capture.placedAssets.map((placed, index) => {
    const stagedHash = placed.assetId ? staged.get(placed.assetId) : undefined;
    const isResolved =
      placed.sourceKind === 'asset' && stagedHash !== undefined;
    return {
      id: `frame-${capture.frame}-asset-${index + 1}`,
      frame: capture.frame,
      role: placed.role,
      assetId: isResolved ? placed.assetId : null,
      contentHash:
        placed.sourceKind === 'embedded'
          ? placed.contentHash
          : isResolved && stagedHash === placed.contentHash
            ? stagedHash
            : null,
      bounds: placed.bounds,
      transform: { css: placed.transform, matrix: matrixOf(placed.transform) },
      opacity: placed.opacity,
    };
  });
}

function weightOf(value: string | null): number | null {
  return value !== null && /^\d{1,4}$/.test(value) ? Number(value) : null;
}

function styleOf(value: string | null): 'normal' | 'italic' | 'oblique' | null {
  return value === 'normal' || value === 'italic' || value === 'oblique'
    ? value
    : null;
}

/**
 * Binds a renderer's observations to the exact exported bytes. Returns no manifest
 * when the observations cannot support one; the artifact then simply has no
 * evidence and every font or layout check on it stays unknown.
 */
export function buildBrandRenderEvidenceManifest(
  input: BuildBrandRenderEvidenceInput,
): BrandRenderEvidenceBuild {
  if (input.observations === undefined || input.observations === null)
    return { manifest: null, reasonCode: 'observations_missing' };
  const parsed = visualRenderObservationsSchema.safeParse(input.observations);
  if (!parsed.success)
    return { manifest: null, reasonCode: 'observations_invalid' };
  const observations = parsed.data;
  const coverage = coverageOf(input, observations);
  if (
    coverage === null ||
    observations.diagnostics.some((code) => BLOCKING_DIAGNOSTICS.has(code))
  )
    return { manifest: null, reasonCode: 'observations_incomplete' };

  const staged = new Map(
    observations.assets
      .filter((asset) => input.authorizedAssetIds.has(asset.id))
      .map((asset) => [asset.id, asset.contentHash]),
  );
  const registry = new FontRegistry(observations.fontFaces, staged);
  const textLayers: BrandRenderEvidenceTextLayerV1[] = [];
  const placedAssets: BrandRenderEvidencePlacedAssetV1[] = [];
  for (const capture of observations.captures) {
    for (const layer of capture.textLayers) {
      const id = `frame-${capture.frame}-text-${textLayers.length + 1}`;
      textLayers.push({
        id,
        frame: capture.frame,
        text: layer.text,
        isTextTruncated: layer.isTextTruncated,
        bounds: layer.bounds,
        declaredFontFamily: layer.fontFamily,
        fontSizePx: layer.fontSizePx,
        requestedWeight: weightOf(layer.fontWeight),
        requestedStyle: styleOf(layer.fontStyle),
        color: layer.color,
        opacity: layer.opacity,
        fontUsage: registry.useFonts(id, layer.fontFamily, layer.platformFonts),
      });
    }
    placedAssets.push(...placedAssetsOf(capture, staged));
  }

  const artifactHash = hashArtifactBytes(input.bytes);
  const body: Omit<BrandRenderEvidenceManifestV1, 'contentHash'> = {
    schemaVersion: 1,
    kind: 'brand_render_evidence',
    id: `bre_${sha256Hex(`${input.artifact.id}\n${artifactHash}`).slice(0, 32)}`,
    organizationId: input.organizationId,
    brandId: input.brandId,
    capturedAt: input.capturedAt.toISOString(),
    artifact: {
      kind: 'ingredient',
      id: input.artifact.id,
      storageKey: input.artifact.storageKey,
      mediaKind: mediaKind(input.artifact.format),
      format: input.artifact.format,
      mimeType:
        input.artifact.format === 'mp4'
          ? 'video/mp4'
          : `image/${input.artifact.format}`,
      contentHash: artifactHash,
      byteLength: input.bytes.byteLength,
      width: input.artifact.width,
      height: input.artifact.height,
    },
    renderer: {
      id: VISUAL_CODE_RENDERER_ID,
      version: input.rendererVersion,
      engine: 'remotion-chromium',
      engineVersion: observations.browser?.product ?? null,
      fontReporting: 'chromium-cdp-platform-fonts',
      isolation: 'gvisor-runsc',
    },
    brandSnapshot: input.brandSnapshot,
    coverage,
    fonts: registry.fonts,
    textLayers,
    fallbacks: registry.fallbacks,
    placedAssets,
    diagnostics: [
      ...new Set([...observations.diagnostics, ...registry.diagnostics]),
    ].sort(),
  };
  const manifest = { ...body, contentHash: hashManifest(body) };
  const valid = brandRenderEvidenceManifestV1Schema.safeParse(manifest);
  return valid.success
    ? { manifest: valid.data, reasonCode: null }
    : { manifest: null, reasonCode: 'manifest_invalid' };
}

export interface ExpectedBrandRenderEvidence {
  organizationId: string;
  brandId: string;
  artifactId: string;
  /** The bytes being validated, read from storage by the caller. */
  bytes: Uint8Array;
}

/**
 * Accepts a stored manifest only when it is intact, belongs to this tenant and
 * artifact, and was produced for exactly these bytes. Anything else is stale or
 * forged and must be treated as no evidence.
 */
export function verifyBrandRenderEvidenceManifest(
  stored: unknown,
  expected: ExpectedBrandRenderEvidence,
): BrandRenderEvidenceVerificationV1 {
  if (stored === undefined || stored === null)
    return {
      status: 'missing',
      manifest: null,
      reasonCode: 'manifest_not_found',
    };
  const parsed = brandRenderEvidenceManifestV1Schema.safeParse(stored);
  const reject = (
    reasonCode: Extract<
      BrandRenderEvidenceVerificationV1,
      { status: 'rejected' }
    >['reasonCode'],
  ): BrandRenderEvidenceVerificationV1 => ({
    status: 'rejected',
    manifest: null,
    reasonCode,
  });
  if (!parsed.success) return reject('manifest_invalid');
  const manifest = parsed.data;
  const { contentHash, ...body } = manifest;
  if (hashManifest(body) !== contentHash)
    return reject('manifest_hash_mismatch');
  if (
    manifest.organizationId !== expected.organizationId ||
    manifest.brandId !== expected.brandId
  )
    return reject('scope_mismatch');
  if (manifest.artifact.id !== expected.artifactId)
    return reject('artifact_identity_mismatch');
  if (
    manifest.artifact.byteLength !== expected.bytes.byteLength ||
    manifest.artifact.contentHash !== hashArtifactBytes(expected.bytes)
  )
    return reject('artifact_hash_mismatch');
  return { status: 'verified', manifest };
}
