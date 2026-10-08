import type { GenerationBillingRequest } from '@api/collections/credits/services/generation-billing.service';
import type { AvatarVideoAspectRatio } from '@api/collections/videos/dto/create-avatar-video.dto';
import type { VoiceDocument } from '@api/collections/voices/schemas/voice.schema';
import type {
  HeyGenAvatarCandidate,
  ResolvedHeyGenConnection,
} from '@api/services/integrations/heygen/heygen-identity.types';
import type { DefaultVoiceRef } from '@api/shared/default-voice-ref/default-voice-ref.schema';
import type { VoiceProvider } from '@genfeedai/contracts';
import type { HeyGenAvatarRef } from '@genfeedai/contracts/interfaces';

export interface AvatarVideoGenerationContext {
  organizationId: string;
  userId: string;
  brandId?: string;
  /**
   * The caller's own run-level billing (remix run, batch project) already pays
   * for this generation, so the service must not hold credits for it.
   */
  settleCreditsExternally?: boolean;
  /**
   * The HTTP or agent request whose credits guard reserved this generation.
   * When it holds platform credits, the accepted output is bound to that hold;
   * otherwise the service opens its own.
   */
  request?: GenerationBillingRequest;
}

export interface AvatarVideoGenerationParams {
  text: string;
  useIdentity?: boolean;
  photoUrl?: string;
  photoIngredientId?: string;
  audioUrl?: string;
  clonedVoiceId?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  avatarId?: string;
  avatarRef?: HeyGenAvatarCandidate;
  voiceRef?: DefaultVoiceRef;
  audioIngredientId?: string;
  voiceProvider?: string;
  aspectRatio?: AvatarVideoAspectRatio;
}

export interface AvatarVideoGenerationResult {
  ingredientId: string;
  externalId: string;
  status: 'processing';
}

export interface AvatarGenerationPrice {
  billingMode: 'byok' | 'platform';
  credits: number;
}

export interface AvatarGenerationFunding extends AvatarGenerationPrice {
  heygenApiKey?: string;
  elevenLabsApiKey?: string;
}

export interface ResolvedIdentity {
  avatarRef?: HeyGenAvatarRef;
  heygenConnection?: ResolvedHeyGenConnection;
  voiceRef?: DefaultVoiceRef;
  audioIngredientId?: string;
  audioUrl?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  photoIngredientId?: string;
  photoUrl?: string;
  savedVoice?: ResolvableVoiceDocument;
}

export type ResolvableVoiceDocument = Pick<
  VoiceDocument,
  'externalVoiceId' | 'sampleAudioUrl'
> & {
  provider?: VoiceProvider | string | null;
};

export interface ResolvedAudioSource {
  audioDuration: number;
  audioUrl?: string;
  heygenVoiceId?: string;
}
