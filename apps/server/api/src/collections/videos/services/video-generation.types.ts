export type PromptInput = Record<string, unknown> & {
  prompt?: string;
  resolution?: string;
};

/**
 * Parameters passed to the single provider-dispatch helper. The same shape is
 * reused for the first output and every additional output, so provider routing
 * lives in exactly one place.
 */
export interface DispatchVideoGenerationParams {
  duration?: number;
  height: number;
  imageUrl?: string;
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
  referenceIds: string[];
  request: Request;
  user: User;
}

export interface VideoGenerationContext extends ResolvedVideoGenerationRequest {
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
import type { VideoGenerationBrief } from '@api-types/contracts/generation-brief.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@api-types/contracts/video-generation-brief-compiler.contract';
import type { ModelProvider } from '@genfeedai/enums';
