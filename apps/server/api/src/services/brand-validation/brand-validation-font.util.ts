import type { BrandArtifactVisual } from '@api/services/brand-validation/brand-validation-visual.util';
import type { BrandFontProofV1 } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandRenderEvidenceFontV1,
  BrandRenderEvidenceManifestV1,
  BrandRenderEvidenceVerificationV1,
} from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';
import type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationInputV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

const MAX_MATCHED_FONTS = 16;
type Snapshot = BrandArtifactValidationInputV1['snapshot'];
type TypographyRule = Snapshot['generationRules']['typography'][number];
type AssetRule = Snapshot['generationRules']['assets'][number];

/** One approved font, as a rule the platform can recognize in a manifest. */
interface ApprovedFont {
  ruleId: string;
  matches(font: BrandRenderEvidenceFontV1): boolean;
}

const sameFamily = (a: string, b: string) =>
  a.normalize('NFC').trim().toLowerCase() ===
  b.normalize('NFC').trim().toLowerCase();

function assetSourceMatches(
  font: BrandRenderEvidenceFontV1,
  asset: AssetRule,
): boolean {
  const { source } = font;
  if (!asset.contentHash) return false;
  if (source.kind === 'asset')
    return (
      source.assetId === asset.assetId &&
      source.contentHash === asset.contentHash
    );
  return source.kind === 'embedded' && source.contentHash === asset.contentHash;
}

/**
 * Whether a font rule can be recognized in a manifest at all. An owned font is
 * recognized by the hash of the font file the renderer loaded; a font installed
 * in the renderer image is recognized by the family, weight and style the font
 * engine reported, and only when the rule says the runtime font is verified.
 * Anything else has no evidence a manifest can supply.
 */
function approvedFontOf(
  rule: TypographyRule,
  assets: readonly AssetRule[],
): ApprovedFont | null {
  const traitsMatch = (font: BrandRenderEvidenceFontV1) =>
    sameFamily(font.family, rule.family) &&
    font.weight === rule.weight &&
    font.style === rule.style;
  if (rule.availability === 'owned_asset') {
    const asset = assets.find(
      (candidate) =>
        candidate.id === rule.fontAssetReferenceId && candidate.role === 'font',
    );
    return asset
      ? {
          matches: (font) =>
            traitsMatch(font) && assetSourceMatches(font, asset),
          ruleId: rule.id,
        }
      : null;
  }
  if (rule.availability === 'verified_runtime')
    return {
      matches: (font) => traitsMatch(font) && font.source.kind === 'system',
      ruleId: rule.id,
    };
  return null;
}

function unknownCheck(
  check: BrandArtifactValidationCheckV1,
  reasonCode: string,
): BrandArtifactValidationCheckV1 {
  return { ...check, reasonCode, result: 'unknown' };
}

/** Why a layer cannot count as drawn in approved fonts, or null when it can. */
function layerProblem(
  manifest: BrandRenderEvidenceManifestV1,
  layer: BrandRenderEvidenceManifestV1['textLayers'][number],
  approvedFontIds: ReadonlySet<string>,
): string | null {
  if (layer.fontUsage.length === 0) return 'font_usage_unreported';
  if (manifest.fallbacks.some((fallback) => fallback.layerId === layer.id))
    return 'font_fallback_used';
  return layer.fontUsage.every((usage) => approvedFontIds.has(usage.fontId))
    ? null
    : 'font_not_approved';
}

/**
 * Decides the font rules of an exported still from the render manifest the
 * platform's own renderer emitted, once the caller has verified it against the
 * exported bytes. Only a still with complete coverage can be proven: every text
 * layer must be reported, drawn with no fallback, and drawn only with approved
 * fonts (an approved font being one a rule can recognize in the manifest). The
 * rule then passes when its own font drew at least one layer. There is no
 * fail: a layer in a fallback or unapproved font is the renderer's evidence
 * against the design, but not that this rule's font was meant for it.
 *
 * Missing, rejected or foreign evidence, a model-generated image (no manifest),
 * a video (sampled frames) and unreported fonts leave the rule `unknown`.
 */
export function proveBrandFontChecks(
  input: BrandArtifactValidationInputV1,
  checks: readonly BrandArtifactValidationCheckV1[],
  visual: BrandArtifactVisual,
  evidence: BrandRenderEvidenceVerificationV1 | undefined,
): BrandArtifactValidationCheckV1[] {
  const isProvable = (check: BrandArtifactValidationCheckV1) =>
    check.category === 'typography' && check.result === 'unsupported';
  if (
    input.artifact.mediaKind === 'text' ||
    !evidence ||
    !checks.some(isProvable)
  )
    return [...checks];
  const settle = (reasonCode: string) =>
    checks.map((check) =>
      isProvable(check) ? unknownCheck(check, reasonCode) : check,
    );
  if (evidence.status === 'missing') return settle('render_evidence_missing');
  if (evidence.status === 'rejected') return settle('render_evidence_rejected');
  const { manifest } = evidence;
  const { selection } = visual;
  if (selection.kind === 'unknown') return settle(selection.reasonCode);
  // The reader verified the bytes it was given; the manifest must also describe this
  // artifact's final visual and belong to this tenant and brand.
  if (
    manifest.organizationId !== input.snapshot.organizationId ||
    manifest.brandId !== input.snapshot.brandId ||
    manifest.artifact.contentHash !== selection.part.hash ||
    manifest.artifact.mediaKind !== selection.part.mediaKind
  )
    return settle('render_evidence_rejected');
  if (
    selection.part.mediaKind !== 'image' ||
    manifest.coverage.kind !== 'complete'
  )
    return settle('font_coverage_partial');

  const rules = input.snapshot.generationRules;
  const approved: ApprovedFont[] = [];
  for (const rule of rules.typography) {
    const font = approvedFontOf(rule, rules.assets);
    if (font) approved.push(font);
  }
  for (const asset of rules.assets)
    if (asset.role === 'font' && asset.contentHash)
      approved.push({
        matches: (font) => assetSourceMatches(font, asset),
        ruleId: asset.id,
      });
  const approvedFontIds = new Set(
    manifest.fonts
      .filter((font) => approved.some((candidate) => candidate.matches(font)))
      .map((font) => font.id),
  );
  const layers = manifest.textLayers.filter((layer) => /\S/.test(layer.text));
  if (layers.length === 0) return settle('font_no_text_layers');
  for (const layer of layers) {
    const problem = layerProblem(manifest, layer, approvedFontIds);
    if (problem) return settle(problem);
  }
  const frame = manifest.coverage.capturedFrames[0];
  const drawnFontIds = new Set(
    layers.flatMap((layer) => layer.fontUsage.map((usage) => usage.fontId)),
  );
  return checks.map((check) => {
    if (!isProvable(check)) return check;
    const rule = approved.find(
      (candidate) => candidate.ruleId === check.ruleId,
    );
    if (!rule) return unknownCheck(check, 'font_unverifiable');
    const matched = manifest.fonts.filter(
      (font) => drawnFontIds.has(font.id) && rule.matches(font),
    );
    if (matched.length === 0) return unknownCheck(check, 'font_not_used');
    const proof: BrandFontProofV1 = {
      algorithm: 'render-manifest-font-v1',
      artifactHash: input.artifact.contentHash,
      frame,
      kind: 'font',
      manifestHash: manifest.contentHash,
      manifestId: manifest.id,
      matchedFonts: matched.slice(0, MAX_MATCHED_FONTS).map((font) => ({
        family: font.family,
        fontId: font.id,
        sourceKind:
          font.source.kind === 'unknown' ? 'system' : font.source.kind,
        style: font.style,
        weight: font.weight,
      })),
      mediaKind: 'image',
      partHash: selection.part.hash,
      partId: selection.part.id,
      partVersion: selection.part.version,
      renderer: {
        engine: manifest.renderer.engine,
        id: manifest.renderer.id,
        version: manifest.renderer.version,
      },
      textLayers: layers.length,
    };
    const { reasonCode: _unsupported, ...rest } = check;
    return {
      ...rest,
      evaluatorId: `${manifest.renderer.id}:${manifest.renderer.version}`,
      method: 'deterministic_render',
      proof,
      result: 'pass',
    };
  });
}
