import type { RouterPriority } from '../..';
import type { HeyGenAvatarRef } from '../integrations/heygen.interface';
import type { IBrandAgentConfig } from '../organization/brand.interface';

/**
 * The avatar render Studio submits. `POST /videos/avatar` generates it and
 * `POST /videos/avatar/quote` prices the same body without holding credits.
 */
export interface HeyGenAvatarVideoRequest {
  useIdentity?: boolean;
  voiceId?: string;
  voiceProvider?: string;
  voiceRef?: IBrandAgentConfig['defaultVoiceRef'];
  avatarId?: string;
  avatarRef?: HeyGenAvatarRef;
  photoUrl?: string;
  text: string;
  audioUrl?: string;
  audioIngredientId?: string;
  elevenlabsVoiceId?: string;
  heygenVoiceId?: string;
  /** Engine model; omit with `autoSelectModel` to route among the look's engines. */
  model?: string;
  autoSelectModel?: boolean;
  prioritize?: RouterPriority;
}

/**
 * `POST /videos/avatar/quote` attributes: the price admission holds for the
 * same body. A BYOK render is funded by the workspace's own HeyGen key, so it
 * holds no platform credits for the render.
 */
export interface AvatarGenerationQuote {
  billingMode: 'byok' | 'platform';
  credits: number;
  /** Clip length the per-second hold is estimated at; null when not per second. */
  estimatedSeconds: number | null;
  /** The catalog row the render is priced as. */
  modelKey: string;
}
