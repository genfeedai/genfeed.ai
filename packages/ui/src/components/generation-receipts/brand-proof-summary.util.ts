import type { BrandArtifactProofV1 } from '@genfeedai/contracts/api-types/contracts';

export type BrandProofTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const percent = (share: number) => `${Math.round(share * 1000) / 10}%`;

/**
 * One readable line for the measurements behind a deterministic pass or fail,
 * so a reviewer sees what was actually found in the final file. Every value is
 * read from the saved proof; nothing is recomputed.
 */
export function summarizeBrandProof(
  proof: BrandArtifactProofV1,
  t: BrandProofTranslate,
): string {
  switch (proof.kind) {
    case 'palette':
      return t('proof.palette', {
        coverage: percent(proof.coverage),
        distance: proof.nearestSwatchDeltaE,
        frames: proof.sampledFrames,
        pixels: proof.analyzedPixels,
        target: proof.target,
      });
    case 'ocr':
      return t('proof.ocr', {
        frames: proof.sampledFrames,
        matched: proof.matchedFrames.length,
        model: proof.provider.model,
      });
    case 'placement': {
      const best = Math.max(0, ...proof.matches.map((m) => m.similarity));
      return t('proof.placement', {
        count: proof.matches.length,
        model: proof.provider.model,
        query: proof.query,
        similarity: percent(best),
      });
    }
    case 'font':
      return t('proof.font', {
        fonts: proof.matchedFonts.map((font) => font.family).join(', '),
        layers: proof.textLayers,
        renderer: proof.renderer.id,
      });
  }
}
