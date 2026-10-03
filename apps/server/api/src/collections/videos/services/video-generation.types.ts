import type { RequestWithSelectedModel } from '@api/helpers/guards/models/request-with-selected-model.interface';
export type PromptInput = Record<string, unknown> & {
  prompt?: string;
  resolution?: string;
};

/**
 * Parameters passed to the single provider-dispatch helper. The same shape is
 * reused for the first output and every additional output, so provider routing
 * lives in exactly one place.
 */
export interface PreparedFalVideoDispatch {
  endpoint: string;
  input: Record<string, unknown>;
}

export interface DispatchVideoGenerationParams {
  preparedFalDispatch?: PreparedFalVideoDispatch;
  onProviderSubmissionStarted?: () => void;
  duration?: number;
  height: number;
  imageUrl?: string;
  /**
   * The org's own resolved BYOK key (#5294), set only when the credits
   * decision actually bypassed platform credits for this dispatch. Replicate
   * and Fal adapters must forward it as `apiKeyOverride`; providers that
   * cannot honor it always charge credits (see `resolveModelByokProvider`).
   */
  apiKeyOverride?: string;
  model: string;
  modelEndpoint?: string;
  modelInputSchema?: Record<string, unknown>;
  modelProvider?: ModelProvider | string;
  modelSchemaFamily?: string;
  organizationId?: string;
  prompt: string;
  promptParams: Record<string, unknown>;
  width: number;
}

export type VideoGenerationProvider =
  | 'fal'
  | 'heygen'
  | 'higgsfield'
  | 'klingai'
  | 'replicate';

export interface VideoGenerationProviderResult {
  completion: 'polling' | 'remote-output';
  externalId: string | null;
  provider: VideoGenerationProvider;
}

export interface VideoGenerationProviderAdapter {
  readonly provider: VideoGenerationProvider;
  generate(
    params: DispatchVideoGenerationParams,
  ): Promise<VideoGenerationProviderResult>;
  supports(model: string, provider?: ModelProvider | string): boolean;
}

export interface CreateVideoPlaceholderActivityParams {
  brandId: string;
  ingredientId: string;
  model: string;
  organizationId: string;
  userId: string;
}

export type VideoGenerationResolvedBrand = NonNullable<
  Awaited<ReturnType<BrandsService['findOne']>>
>;
export type VideoGenerationResolvedPrompt = Awaited<
  ReturnType<PromptsService['create']>
>;
export type VideoGenerationSaveDocumentsResult = Awaited<
  ReturnType<SharedService['createMediaDocuments']>
>;

export interface ResolvedVideoGenerationRequest {
  brand: VideoGenerationResolvedBrand;
  createVideoDto: CreateVideoDto;
  model: string;
  modelEndpoint?: string;
  modelInputSchema?: Record<string, unknown>;
  modelProvider?: ModelProvider | string;
  modelSchemaFamily?: string;
  /** Reference images of characters granted by another organization (#6037). */
  grantedAvatarOwners?: ReadonlyMap<string, string>;
  /** Character admitted for this request; the output links to it (#6040). */
  personaId?: string | null;
  referenceIds: string[];
  request: RequestWithSelectedModel<Request>;
  user: User;
}

export interface VideoGenerationContext extends ResolvedVideoGenerationRequest {
  preparedFalDispatch?: PreparedFalVideoDispatch;
  generationHarness?: GenerationHarnessReceipt;
  abortSignal: AbortSignal;
  briefEvidence?: VideoGenerationBriefPersistedEvidence;
  compiledDispatch?: Record<string, unknown>;
  generationBrief?: VideoGenerationBrief;
  generationSource?: string;
  height: number;
  ingredientData: VideoGenerationSaveDocumentsResult['ingredientData'];
  metadataData: VideoGenerationSaveDocumentsResult['metadataData'];
  pendingIngredientIds: string[];
  promptData: VideoGenerationResolvedPrompt;
  promptInput: PromptInput;
  promptParams: Record<string, unknown>;
  referenceImageUrls: string[];
  width: number;
}

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import type { ModelProvider } from '@genfeedai/contracts';
import type { VideoGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import type { GenerationHarnessReceipt } from '@genfeedai/contracts/interfaces';
