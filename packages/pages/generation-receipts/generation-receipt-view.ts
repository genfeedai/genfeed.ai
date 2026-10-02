import type {
  BrandedGenerationReceiptReadV1,
  BrandedGenerationReceiptRevisionReadV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation-receipt-read.interface';

export type GenerationReceiptInspection = Readonly<
  Pick<
    BrandedGenerationReceiptReadV1,
    | 'id'
    | 'revision'
    | 'execution'
    | 'resolutionHash'
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

/** Historical read projection; preserves recorded facts without deriving readiness. */
export function projectGenerationReceiptForInspection(
  receipt:
    | BrandedGenerationReceiptReadV1
    | BrandedGenerationReceiptRevisionReadV1
    | null,
): GenerationReceiptInspection | null {
  if (!receipt) return null;
  const {
    id,
    revision,
    execution,
    resolutionHash,
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
    revision,
    execution,
    resolutionHash,
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
