import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

/** The reason a check carries while its OCR or placement reading waits for the background job. */
export const BRAND_VISION_PENDING_REASON = 'visual_analysis_pending';

/** True while any check of the receipt's validation waits for the background brand vision job. */
export function hasPendingBrandVisionChecks(
  receipt: Pick<BrandedGenerationReceiptV1, 'validation'>,
): boolean {
  return (
    receipt.validation?.checks.some(
      (check) => check.reasonCode === BRAND_VISION_PENDING_REASON,
    ) ?? false
  );
}
