import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { buildPromptBrandingFromBrand } from '@api/collections/brands/utils/brand-context.util';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { PromptsService } from '@api/collections/prompts/services/prompts.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import type { SharedService } from '@api/shared/services/shared/shared.service';

/** Document types inferred from the underlying services (no `any`). */
export type ResolvedBrand = NonNullable<
  Awaited<ReturnType<BrandsService['findOne']>>
>;
export type ResolvedPrompt = Awaited<ReturnType<PromptsService['create']>>;
export type SaveDocumentsResult = Awaited<
  ReturnType<SharedService['saveDocuments']>
>;
export type SavedIngredient = SaveDocumentsResult['ingredientData'];
export type SavedMetadata = SaveDocumentsResult['metadataData'];
export type PublicMetadata = ReturnType<typeof getPublicMetadata>;

/**
 * Per-request state threaded through the provider handlers and the shared
 * completion tail. Built once by {@link ImageGenerationService.generateImage}
 * after the placeholder documents exist, so every handler reads from one place
 * instead of the previous flat method's shared mutable locals.
 */
export interface GenerationContext {
  brand: ResolvedBrand;
  brandPromptBranding: ReturnType<typeof buildPromptBrandingFromBrand>;
  createImageDto: CreateImageDto;
  height: number;
  ingredientData: SavedIngredient;
  metadataData: SavedMetadata;
  model: string;
  outputs: number;
  /** Mutated by handlers (Fal) that fan out additional background outputs. */
  pendingIngredientIds: string[];
  promptBuilderBrand: {
    description?: string;
    label: string;
    primaryColor?: string;
    secondaryColor?: string;
    text?: string;
  };
  promptData: ResolvedPrompt;
  publicMetadata: PublicMetadata;
  referenceImageUrl: string | null;
  referenceImageUrls: string[];
  request: Request;
  style?: string;
  user: User;
  waitForCompletion: boolean;
  websocketUrl: string;
  width: number;
}

/**
 * How the request should resolve once a provider has dispatched.
 *
 * - `inline` — GenfeedAi completes synchronously inside its promise; on wait we
 *   re-read the ingredient (no polling, no timeout recovery).
 * - `poll-single` — KlingAI/Leonardo poll one ingredient to completion.
 * - `poll-multiple` — Replicate polls every fanned-out ingredient id.
 * - `background-only` — Fal never blocks the request; always returns the
 *   placeholder immediately.
 */
export interface CompletionPlan {
  generationPromise: Promise<unknown>;
  kind: 'inline' | 'poll-single' | 'poll-multiple' | 'background-only';
  pollIds?: string[];
}

/** Shape of the deferred credits config attached to the request object. */
export interface DeferredCreditsConfig {
  amount?: number;
  deferred?: boolean;
  modelKey?: string;
}
