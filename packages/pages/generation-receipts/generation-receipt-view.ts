import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces';

export type GenerationReceiptInspection = Readonly<
  Pick<
    BrandedGenerationReceiptV1,
    | 'id'
    | 'state'
    | 'mode'
    | 'surface'
    | 'contentType'
    | 'format'
    | 'platform'
    | 'snapshot'
    | 'layers'
    | 'learning'
    | 'prompts'
    | 'artifact'
    | 'validation'
    | 'compliance'
    | 'diagnostics'
    | 'costs'
    | 'budget'
    | 'createdAt'
    | 'updatedAt'
  >
>;

/** Historical internal projection; caller must authorize the supplied receipt. */
export function projectGenerationReceiptForInspection(
  receipt: BrandedGenerationReceiptV1 | null,
): GenerationReceiptInspection | null {
  if (!receipt) return null;
  const {
    id,
    state,
    mode,
    surface,
    contentType,
    format,
    platform,
    snapshot,
    layers,
    learning,
    prompts,
    artifact,
    validation,
    compliance,
    diagnostics,
    costs,
    budget,
    createdAt,
    updatedAt,
  } = receipt;
  return structuredClone({
    id,
    state,
    mode,
    surface,
    contentType,
    format,
    platform,
    snapshot,
    layers,
    learning,
    prompts,
    artifact,
    validation,
    compliance,
    diagnostics,
    costs,
    budget,
    createdAt,
    updatedAt,
  });
}
