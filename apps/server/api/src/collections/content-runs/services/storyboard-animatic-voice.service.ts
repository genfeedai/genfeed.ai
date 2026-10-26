import type { StoryboardARollPresenter } from '@api/collections/content-runs/services/storyboard-a-roll-plan';
import { estimateAvatarSpeechSeconds } from '@api/collections/videos/services/avatar-video-duration.util';
import { VoiceCreditsService } from '@api/collections/voices/services/voice-credits.service';
import { VoiceGenerationService } from '@api/collections/voices/services/voice-generation.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { VoiceProvider } from '@genfeedai/contracts';
import {
  countSpeechCharacters,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { ConflictException, Injectable } from '@nestjs/common';

export interface AnimaticVoice {
  externalVoiceId: string;
  provider: VoiceProvider.ELEVENLABS | VoiceProvider.HEYGEN;
  modelKey: string;
}

export interface AnimaticSpeechPrice {
  billingMode: 'platform';
  credits: number;
  estimatedSeconds: number;
  modelKey: string;
}

/**
 * Speaks the animatic narration (#8232): the presenter's own voice on the
 * cheapest speech model, so the creator hears the pacing for cents before the
 * paid avatar render. The voice pipeline holds and settles its own credits.
 */
@Injectable()
export class StoryboardAnimaticVoiceService {
  constructor(
    private readonly voices: VoicesService,
    private readonly credits: VoiceCreditsService,
    private readonly speech: VoiceGenerationService,
  ) {}

  /** The presenter's saved voice as a catalog voice the speech models speak. */
  async resolve(
    organizationId: string,
    presenter: StoryboardARollPresenter,
  ): Promise<AnimaticVoice> {
    const voice = await this.voices.findOne({
      id: presenter.voiceId,
      isDeleted: false,
      organizationId,
    });
    const provider = voice?.provider;
    const externalVoiceId =
      typeof voice?.externalVoiceId === 'string'
        ? voice.externalVoiceId
        : undefined;
    if (provider === VoiceProvider.ELEVENLABS && externalVoiceId)
      return {
        externalVoiceId,
        provider,
        modelKey: MODEL_KEYS.ELEVENLABS_FLASH_V2_5,
      };
    if (provider === VoiceProvider.HEYGEN && externalVoiceId)
      return { externalVoiceId, provider, modelKey: MODEL_KEYS.HEYGEN_VOICE };
    throw new ConflictException(
      'This voice cannot speak a draft. Choose an ElevenLabs or HeyGen voice for the presenter.',
    );
  }

  /** The platform price; a workspace key pays the provider and is not charged. */
  async quote(
    organizationId: string,
    voice: AnimaticVoice,
    text: string,
  ): Promise<AnimaticSpeechPrice> {
    const quote = await this.credits.quoteSpeech({
      characters: countSpeechCharacters(text),
      modelKey: voice.modelKey,
      organizationId,
      provider:
        voice.provider === VoiceProvider.HEYGEN ? 'heygen' : 'elevenlabs',
    });
    return {
      billingMode: 'platform',
      credits: quote.credits,
      estimatedSeconds: estimateAvatarSpeechSeconds(text),
      modelKey: voice.modelKey,
    };
  }

  /** Starts the speech and returns the voice asset it will fill. */
  async speak(params: {
    organizationId: string;
    brandId: string;
    userId: string;
    voice: AnimaticVoice;
    text: string;
    sourceActionId: string;
  }): Promise<string> {
    const ingredient = await this.speech.generate(
      {
        id: params.userId,
        userId: params.userId,
        organizationId: params.organizationId,
        brandId: params.brandId,
      },
      {
        text: params.text,
        voiceId: params.voice.externalVoiceId,
        voiceProvider: params.voice.provider,
        model: params.voice.modelKey,
        sourceActionId: params.sourceActionId,
      },
    );
    return String(ingredient.id);
  }
}
