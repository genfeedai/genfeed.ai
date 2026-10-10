import type { BrandedGenerationJsonV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

export type MediaGenerationReceiptKindV1 = 'image' | 'video';

/** One Studio media output, described when it is admitted for dispatch. */
export interface MediaGenerationReceiptOpenInputV1 {
  organizationId: string;
  brandId: string;
  actorId: string;
  isApiKey?: boolean;
  apiKeyId?: string;
  scopes?: string[];
  /** The output ingredient; it is also the receipt request key. */
  ingredientId: string;
  /** The request's first output when this output is an additional variant. */
  parentIngredientId?: string;
  mediaKind: MediaGenerationReceiptKindV1;
  surface: BrandedGenerationInputV1['surface'];
  provider: string;
  model: string;
  /** What the caller typed, before enhancement or compilation. */
  originalPrompt: string;
  /** Prompt-enhancement output, only when enhancement was applied. */
  enhancedPrompt?: string;
  /** The prompt actually sent to the provider. */
  compiledPrompt: string;
  generationParameters: Record<string, BrandedGenerationJsonV1>;
}

/**
 * Which half of the media completion contract reported the output: its hold
 * was settled (delivered) or released (will not be delivered).
 */
export type MediaGenerationTerminalSignalV1 = 'settled' | 'released';

/** The provider accepted one output's attempt. */
export interface MediaGenerationReceiptAcceptanceV1 {
  organizationId: string;
  ingredientId: string;
  provider: string;
  model: string;
  externalId: string;
}

/** A media output's current receipt plus the ingredient evidence it settles from. */
export interface LocatedMediaGenerationReceiptV1 {
  actor: BrandedGenerationActorV1;
  receipt: BrandedGenerationReceiptV1;
  ingredient: {
    status: string;
    category: string;
    metadata: {
      model: string | null;
      externalId: string | null;
      externalProvider: string | null;
    } | null;
  };
}
