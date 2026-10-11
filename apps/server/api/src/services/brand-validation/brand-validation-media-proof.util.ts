import { proveBrandFontChecks } from '@api/services/brand-validation/brand-validation-font.util';
import { proveBrandLiteralChecksFromOcr } from '@api/services/brand-validation/brand-validation-ocr.util';
import { proveBrandPaletteChecks } from '@api/services/brand-validation/brand-validation-palette.util';
import { proveBrandPlacementChecks } from '@api/services/brand-validation/brand-validation-placement.util';
import { BrandArtifactVisual } from '@api/services/brand-validation/brand-validation-visual.util';
import type { BrandVisualAnalysis } from '@api/services/brand-validation/brand-visual-analysis.types';
import type { BrandRenderEvidenceVerificationV1 } from '@genfeedai/contracts/interfaces/content/brand-render-evidence.interface';
import type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationInputV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

/**
 * Replaces the checks the text pass could not decide with what the final pixels
 * of an image or video prove: palette presence, fonts from a verified render
 * manifest, OCR literals and logo or product placement. The artifact is decoded once for all of them; anything unprovable
 * stays unknown.
 */
export async function proveBrandMediaChecks(
  input: BrandArtifactValidationInputV1,
  checks: readonly BrandArtifactValidationCheckV1[],
  options: {
    visualAnalysis?: BrandVisualAnalysis;
    renderEvidence?: BrandRenderEvidenceVerificationV1;
  },
): Promise<BrandArtifactValidationCheckV1[]> {
  const visual = new BrandArtifactVisual(input);
  return proveBrandPlacementChecks(
    input,
    await proveBrandLiteralChecksFromOcr(
      input,
      proveBrandFontChecks(
        input,
        await proveBrandPaletteChecks(input, checks, visual),
        visual,
        options.renderEvidence,
      ),
      visual,
      options.visualAnalysis,
    ),
    visual,
    options.visualAnalysis,
  );
}
