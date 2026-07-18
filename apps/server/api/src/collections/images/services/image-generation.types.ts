import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import type { SharedService } from '@api/shared/services/shared/shared.service';

export type ImageGenerationProvider =
  | 'genfeedai'
  | 'klingai'
  | 'fal'
  | 'leonardo'
  | 'replicate'
  | 'sdxl';

export type ImageGenerationResolvedBrand = NonNullable<
  Awaited<ReturnType<BrandsService['findOne']>>
>;
export type ImageGenerationResolvedPrompt = Awaited<
  ReturnType<PromptsService['create']>
>;
export type ImageGenerationSaveDocumentsResult = Awaited<
  ReturnType<SharedService['saveDocuments']>
>;
export type ImageGenerationSavedIngredient =
  ImageGenerationSaveDocumentsResult['ingredientData'];
export type ImageGenerationSavedMetadata =
  ImageGenerationSaveDocumentsResult['metadataData'];
export type ImageGenerationPublicMetadata = ReturnType<
  typeof getPublicMetadata
>;

export interface ImageGenerationContext {
  brand: ImageGenerationResolvedBrand;
  brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
  createImageDto: CreateImageDto;
  height: number;
  ingredientData: ImageGenerationSavedIngredient;
  metadataData: ImageGenerationSavedMetadata;
  model: string;
  outputs: number;
  pendingIngredientIds: string[];
  promptBuilderBrand: {
    description?: string;
    label: string;
    primaryColor?: string;
    secondaryColor?: string;
    text?: string;
  };
  promptData: ImageGenerationResolvedPrompt;
  publicMetadata: ImageGenerationPublicMetadata;
  referenceImageUrl: string | null;
  referenceImageUrls: string[];
  request: Request;
  style?: string;
  user: User;
  waitForCompletion: boolean;
  websocketUrl: string;
  width: number;
}

export interface ImageGenerationCompletionPlan {
  generationPromise: Promise<unknown>;
  kind: 'inline' | 'poll-single' | 'poll-multiple' | 'background-only';
  pollIds?: string[];
}
