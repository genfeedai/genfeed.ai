/**
 * Internal types for VideoGenerationService.
 * Extracted per repo rule: no inline interfaces in service files.
 */

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
  prompt: string;
  promptParams: Record<string, unknown>;
  width: number;
}

export type VideoGenerationProvider = 'fal' | 'klingai' | 'replicate';

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
  supports(model: string): boolean;
}

export interface CreateVideoPlaceholderActivityParams {
  brandId: string;
  authProviderUserId: string;
  ingredientId: string;
  model: string;
  organization: string;
  user: string;
}

export type VideoGenerationPublicMetadata = ReturnType<
  typeof getPublicMetadata
>;
export type VideoGenerationResolvedBrand = NonNullable<
  Awaited<ReturnType<BrandsService['findOne']>>
>;
export type VideoGenerationResolvedPrompt = Awaited<
  ReturnType<PromptsService['create']>
>;
export type VideoGenerationSaveDocumentsResult = Awaited<
  ReturnType<SharedService['saveDocuments']>
>;

export interface ResolvedVideoGenerationRequest {
  brand: VideoGenerationResolvedBrand;
  createVideoDto: CreateVideoDto;
  model: string;
  publicMetadata: VideoGenerationPublicMetadata;
  referenceIds: string[];
  request: Request;
  user: User;
}

export interface VideoGenerationContext extends ResolvedVideoGenerationRequest {
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
import type { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import type { SharedService } from '@api/shared/services/shared/shared.service';
