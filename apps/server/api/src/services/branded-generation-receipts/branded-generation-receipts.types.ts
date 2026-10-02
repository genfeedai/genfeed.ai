import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandPromptReferenceV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
export interface BrandedGenerationActorV1 {
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
