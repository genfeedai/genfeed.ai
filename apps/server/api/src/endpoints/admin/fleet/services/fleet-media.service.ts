import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AdminFleetCharacterService } from '@api/endpoints/admin/fleet/services/fleet-character.service';
import { FleetService } from '@api/services/integrations/fleet/fleet.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';
import { ElevenLabsService } from '@server/services/integrations/elevenlabs/services/elevenlabs.service';

/**
 * Owns fleet lip-sync video generation and TTS voice generation, preferring
 * the self-hosted fleet and falling back to ElevenLabs / HeyGen.
 */
@Injectable()
export class AdminFleetMediaService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly characterService: AdminFleetCharacterService,
    private readonly ingredientsService: IngredientsService,
    private readonly heyGenService: HeyGenService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly fleetService: FleetService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Generate a lip-synced video using HeyGen photo avatar API.
   * If text is provided instead of audioUrl, generates TTS first.
   */
  @SentryTraced()
  async generateLipSync(
    organizationId: string,
    data: {
      personaSlug: string;
      imageUrl: string;
      audioUrl?: string;
      text?: string;
    },
  ): Promise<{ jobId: string; status: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      personaSlug: data.personaSlug,
    });

    // Verify persona exists
    const persona = await this.characterService.requirePersonaBySlug(
      data.personaSlug,
      organizationId,
    );

    let audioUrl = data.audioUrl;

    // If text is provided, generate TTS audio first
    if (!audioUrl && data.text) {
      const defaultVoiceId = (persona as Record<string, unknown>).voiceId as
        | string
        | undefined;

      if (!defaultVoiceId) {
        throw new BadRequestException(
          'No audio URL provided and character has no default voice. Provide an audioUrl or set a voice for this character.',
        );
      }

      const ttsResult = await this.elevenLabsService.generateAndUploadAudio(
        defaultVoiceId,
        data.text,
        `lip-sync-${Date.now()}`,
      );

      audioUrl = ttsResult.audioUrl;
    }

    if (!audioUrl) {
      throw new BadRequestException('Either audioUrl or text must be provided');
    }

    const metadataId = `lip-sync-${persona.slug}-${Date.now()}`;
    const videoId = await this.heyGenService.generatePhotoAvatarVideo(
      metadataId,
      data.imageUrl,
      audioUrl,
    );

    return {
      jobId: videoId,
      status: 'processing',
    };
  }

  /**
   * Check lip sync job status via HeyGen.
   */
  async getLipSyncStatus(
    jobId: string,
  ): Promise<{ status: string; videoUrl?: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { jobId });

    const statusClient = this.heyGenService as unknown as {
      getVideoStatus?: (
        id: string,
      ) => Promise<{ status: string; videoUrl?: string }>;
    };

    if (typeof statusClient.getVideoStatus === 'function') {
      try {
        const status = await statusClient.getVideoStatus(jobId);
        if (status?.status) {
          return status;
        }
      } catch (error: unknown) {
        this.loggerService.warn(
          `${caller} provider status polling unavailable, falling back to webhook-driven state`,
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobId,
          },
        );
      }
    }

    this.loggerService.debug(
      `${caller} returning processing state via fallback`,
      { jobId },
    );

    return {
      status: 'processing',
    };
  }

  /**
   * Get available TTS voices from the self-hosted fleet first, then ElevenLabs.
   */
  async getVoices(): Promise<
    { name: string; preview?: string; voiceId: string }[]
  > {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller);

    const voiceProfiles = await this.fleetService.getVoiceProfiles();
    if (voiceProfiles && voiceProfiles.length > 0) {
      return voiceProfiles.map((voice) => ({
        name: voice.label,
        preview: voice.sampleUrl,
        voiceId: voice.handle,
      }));
    }

    return this.elevenLabsService.getVoices();
  }

  /**
   * Generate TTS audio using the self-hosted fleet first, then ElevenLabs.
   */
  async generateVoice(
    organizationId: string,
    data: {
      personaSlug?: string;
      text: string;
      voiceId: string;
      speed?: number;
    },
  ): Promise<{ audioUrl: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      organizationId,
      textLength: data.text.length,
      voiceId: data.voiceId,
    });

    const referenceAudio = await this.resolveFleetReferenceAudio(
      organizationId,
      data.personaSlug,
    );

    const fleetResult = await this.fleetService.generateVoice({
      organizationId,
      referenceAudio,
      text: data.text,
      voicePreset: data.voiceId,
    });

    if (fleetResult?.jobId) {
      const audioUrl = await this.pollFleetVoiceAudioUrl(
        fleetResult.jobId,
        organizationId,
      );
      if (audioUrl) {
        return { audioUrl };
      }

      this.loggerService.warn(caller, {
        jobId: fleetResult.jobId,
        message:
          'Fleet voice generation did not complete in time, falling back',
      });
    }

    const ingredientId = `tts-${Date.now()}`;
    const result = await this.elevenLabsService.generateAndUploadAudio(
      data.voiceId,
      data.text,
      ingredientId,
    );

    return {
      audioUrl: result.audioUrl,
    };
  }

  private async resolveFleetReferenceAudio(
    organizationId: string,
    personaSlug?: string,
  ): Promise<string | undefined> {
    if (!personaSlug) {
      return undefined;
    }

    const persona = await this.characterService.findPersonaBySlug(
      personaSlug,
      organizationId,
    );

    if (!persona?.voice) {
      return undefined;
    }

    const voiceIngredient = await this.ingredientsService.findOne({
      _id: persona.voice.toString(),
      isDeleted: false,
      organization: organizationId,
    });

    return voiceIngredient?.cdnUrl ?? undefined;
  }

  private async pollFleetVoiceAudioUrl(
    jobId: string,
    organizationId?: string,
  ): Promise<string | undefined> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await this.fleetService.pollJob(
        'voices',
        jobId,
        organizationId,
      );
      const audioUrl = result?.audioUrl;
      if (typeof audioUrl === 'string' && audioUrl !== '') {
        return audioUrl;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 1500);
      });
    }

    return undefined;
  }
}
