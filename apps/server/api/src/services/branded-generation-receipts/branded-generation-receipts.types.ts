import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import type {
  BrandArtifactValidationMaterialV1,
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandGenerationArtifactV1,
  BrandPromptReferenceV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
export interface BrandedGenerationActorV1 {
  isApiKey?: boolean;
  apiKeyId?: string;
  scopes?: string[];
  organizationId: string;
  brandId: string;
  actorId: string;
}
export interface BrandedGenerationMutationV1 {
  operationKey: string;
  expectedRevision: number;
}
export interface BrandedGenerationMutationResultV1 {
  receipt: BrandedGenerationReceiptV1;
  replayed: boolean;
}
export interface BrandedGenerationReceiptPageV1 {
  items: BrandedGenerationReceiptV1[];
  nextCursor: string | null;
}
export interface BrandedGenerationReceiptHistoryV1 {
  items: BrandedGenerationReceiptV1[];
  nextAfterRevision: number | null;
}
export type BrandedGenerationPromptStageV1 =
  | 'original'
  | 'enhanced'
  | 'compiled';
export type BrandedGenerationPromptReadV1 =
  | { status: 'retained'; text: string; contentHash: string }
  | {
      status: 'unavailable';
      reasonCode:
        | 'prompt_snapshot_unavailable'
        | 'prompt_payload_purged'
        | 'prompt_integrity_failed';
    };
export type BrandedGenerationPromptFormatV1 =
  | 'genfeed.branded-generation-prompt.v1'
  | 'genfeed.branded-generation-compiled.v1';
export type BrandedGenerationCompiledReadV1 =
  | {
      status: 'retained';
      text: string;
      contentHash: string;
      retainedInput: BrandedGenerationInputV1;
      compilerRecipe: BrandedGenerationCompilerRecipeV1;
      compilerRecipeHash: string;
    }
  | {
      status: 'unavailable';
      reasonCode:
        | 'compiler_recipe_unavailable'
        | 'prompt_snapshot_unavailable'
        | 'prompt_payload_purged'
        | 'prompt_integrity_failed';
    };
export interface BrandedGenerationPreparedPromptV1 {
  reference: BrandPromptReferenceV1;
  record: {
    id: string;
    format: BrandedGenerationPromptFormatV1;
    ciphertext: string;
    contentHash: string;
  } | null;
}

export interface BrandedGenerationDispatchInputV1 {
  provider: string;
  model: string;
  capabilityId?: string;
  capabilityVersion?: number;
  providerAttemptRef: string;
  dispatchClaimedAt: string;
  providerAcceptedAt: string;
}
export interface BrandedGenerationArtifactBindingV1 {
  artifact: BrandGenerationArtifactV1;
  textHash: string | null;
}
export interface BrandedGenerationArtifactCompletionV1
  extends BrandedGenerationArtifactBindingV1 {
  completedAt: string;
}
export interface BrandedGenerationFailureInputV1 {
  reasonCode: string;
  completedAt: string;
}
/** Why a resolved receipt stopped before any provider accepted its attempt. */
export type BrandedGenerationBlockReasonV1 =
  | 'provider_attempt_ref_unavailable'
  | 'provider_submission_failed';
export interface BrandedGenerationDispatchRecoveryV1 {
  blocked: string[];
  skipped: string[];
}
export interface BrandedGenerationAcquiredMaterialV1 {
  receipt: BrandedGenerationReceiptV1;
  material: BrandArtifactValidationMaterialV1;
}

export interface BrandedGenerationReceiptCursorV1 {
  createdAt: string;
  id: string;
}
