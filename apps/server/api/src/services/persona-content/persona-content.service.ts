import { type PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/elevenlabs.service';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { AvatarProvider, VoiceProvider } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, NotFoundException } from '@nestjs/common';

export interface GeneratePhotoInput {
  personaId: string;
  organization: string;
  user: string;
  prompt?: string;
}

export interface GenerateVideoInput {
  personaId: string;
  organization: string;
  user: string;
  script: string;
  aspectRatio?: string;
}

export interface GenerateVoiceInput {
  personaId: string;
  organization: string;
  user: string;
  text: string;
  ingredientId?: string;
}

export interface GenerationResult {
  url?: string;
  jobId?: string;
  status: 'completed' | 'queued' | 'failed';
  provider: string;
}

@Injectable()
export class PersonaContentService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly personasService: PersonasService,
    private readonly heyGenService: HeyGenService,
    private readonly hedraService: HedraService,
    private readonly elevenLabsService: ElevenLabsService,
  ) {}

  async generatePhoto(input: GeneratePhotoInput): Promise<GenerationResult> {
    const caller = CallerUtil.getCallerName();
    const persona = await this.getPersonaOrFail(
      input.personaId,
      input.organization,
    );

    try {
      if (persona.avatarProvider === AvatarProvider.HEDRA) {
        const jobId = await this.hedraService.generateCharacterWithText(
          undefined as unknown,
          input.prompt ?? '',
          persona.avatarExternalId ?? '',
          '1:1',
          String(input.organization),
          String(input.user),
        );

        return {
          jobId,
          provider: AvatarProvider.HEDRA,
          status: 'queued',
        };
      }

      const url = await this.heyGenService.generatePhotoAvatarVideo(
        undefined as unknown,
        persona.avatarExternalId ?? '',
        persona.voiceExternalId ?? '',
        input.prompt ?? '',
        String(input.organization),
        String(input.user),
      );

      return {
        provider: AvatarProvider.HEYGEN,
        status: 'queued',
        url,
      };
    } catch (error) {
      this.loggerService.error(
        `${this.constructorName} ${caller} - generatePhoto failed`,
        error,
      );

      return {
        provider: persona.avatarProvider ?? AvatarProvider.HEYGEN,
        status: 'failed',
      };
    }
  }

  async generateVideo(input: GenerateVideoInput): Promise<GenerationResult> {
    const caller = CallerUtil.getCallerName();
    const persona = await this.getPersonaOrFail(
      input.personaId,
      input.organization,
    );

    try {
      if (persona.avatarProvider === AvatarProvider.HEDRA) {
        const jobId = await this.hedraService.generateCharacterWithText(
          undefined as unknown,
          input.script,
          persona.avatarExternalId ?? '',
          input.aspectRatio ?? '16:9',
          String(input.organization),
          String(input.user),
        );

        return {
          jobId,
          provider: AvatarProvider.HEDRA,
          status: 'queued',
        };
      }

      const jobId = await this.heyGenService.generateAvatarVideo(
        undefined as unknown,
        persona.avatarExternalId ?? '',
        persona.voiceExternalId ?? '',
        input.script,
        String(input.organization),
        String(input.user),
      );

      return {
        jobId,
        provider: AvatarProvider.HEYGEN,
        status: 'queued',
      };
    } catch (error) {
      this.loggerService.error(
        `${this.constructorName} ${caller} - generateVideo failed`,
        error,
      );

      return {
        provider: persona.avatarProvider ?? AvatarProvider.HEYGEN,
        status: 'failed',
      };
    }
  }

  async generateVoice(input: GenerateVoiceInput): Promise<GenerationResult> {
    const caller = CallerUtil.getCallerName();
    const persona = await this.getPersonaOrFail(
      input.personaId,
      input.organization,
    );

    try {
      if (
        persona.voiceProvider === VoiceProvider.ELEVENLABS &&
        persona.voiceExternalId
      ) {
        const result = await this.elevenLabsService.generateAndUploadAudio(
          persona.voiceExternalId,
          input.text,
          input.ingredientId
            ? String(input.ingredientId)
            : (undefined as unknown),
          String(input.organization),
          String(input.user),
        );

        return {
          provider: VoiceProvider.ELEVENLABS,
          status: 'completed',
          url: result.audioUrl,
        };
      }

      if (
        persona.voiceProvider === VoiceProvider.HEYGEN &&
        persona.voiceExternalId
      ) {
        const result = await this.heyGenService.generateAvatarVideo(
          undefined as unknown,
          persona.avatarExternalId ?? '',
          persona.voiceExternalId,
          input.text,
          String(input.organization),
          String(input.user),
        );

        return {
          jobId: result,
          provider: VoiceProvider.HEYGEN,
          status: 'queued',
        };
      }

      throw new Error('No voice provider configured for this persona');
    } catch (error) {
      this.loggerService.error(
        `${this.constructorName} ${caller} - generateVoice failed`,
        error,
      );

      return {
        provider: persona.voiceProvider ?? 'unknown',
        status: 'failed',
      };
    }
  }

  private async getPersonaOrFail(
    personaId: string,
    organization: string,
  ): Promise<PersonaDocument> {
    const persona = await this.personasService.findOne({
      _id: personaId,
      isDeleted: false,
      organization,
    });

    if (!persona) {
      throw new NotFoundException('Persona not found');
    }

    return persona;
  }
}
