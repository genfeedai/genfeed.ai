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

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private requireString(value: unknown, label: string): string {
    const stringValue = this.readString(value);

    if (!stringValue) {
      throw new Error(`${label} is required`);
    }

    return stringValue;
  }

  async generatePhoto(input: GeneratePhotoInput): Promise<GenerationResult> {
    const caller = CallerUtil.getCallerName();
    const persona = await this.getPersonaOrFail(
      input.personaId,
      input.organization,
    );
    const metadataId = String(persona._id);
    const organizationId = String(input.organization);
    const userId = String(input.user);
    const avatarExternalId = this.requireString(
      persona.avatarExternalId,
      'Persona avatarExternalId',
    );

    try {
      if (persona.avatarProvider === AvatarProvider.HEDRA) {
        const jobId = await this.hedraService.generateCharacterWithText(
          metadataId,
          input.prompt ?? '',
          avatarExternalId,
          this.readString(persona.voiceExternalId),
          '1:1',
          organizationId,
          userId,
        );

        return {
          jobId,
          provider: AvatarProvider.HEDRA,
          status: 'queued',
        };
      }

      const url = await this.heyGenService.generatePhotoAvatarVideo(
        metadataId,
        avatarExternalId,
        {
          inputText: input.prompt ?? '',
          voiceId: this.requireString(
            persona.voiceExternalId,
            'Persona voiceExternalId',
          ),
        },
        organizationId,
        userId,
        undefined,
        '1:1',
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
    const metadataId = String(persona._id);
    const organizationId = String(input.organization);
    const userId = String(input.user);
    const avatarExternalId = this.requireString(
      persona.avatarExternalId,
      'Persona avatarExternalId',
    );

    try {
      if (persona.avatarProvider === AvatarProvider.HEDRA) {
        const jobId = await this.hedraService.generateCharacterWithText(
          metadataId,
          input.script,
          avatarExternalId,
          this.readString(persona.voiceExternalId),
          input.aspectRatio ?? '16:9',
          organizationId,
          userId,
        );

        return {
          jobId,
          provider: AvatarProvider.HEDRA,
          status: 'queued',
        };
      }

      const jobId = await this.heyGenService.generateAvatarVideo(
        metadataId,
        avatarExternalId,
        this.requireString(persona.voiceExternalId, 'Persona voiceExternalId'),
        input.script,
        organizationId,
        userId,
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
    const metadataId = String(persona._id);
    const organizationId = String(input.organization);
    const userId = String(input.user);
    const voiceExternalId = this.readString(persona.voiceExternalId);

    try {
      if (
        persona.voiceProvider === VoiceProvider.ELEVENLABS &&
        voiceExternalId
      ) {
        const result = await this.elevenLabsService.generateAndUploadAudio(
          voiceExternalId,
          input.text,
          input.ingredientId ? String(input.ingredientId) : metadataId,
          organizationId,
          userId,
        );

        return {
          provider: VoiceProvider.ELEVENLABS,
          status: 'completed',
          url: result.audioUrl,
        };
      }

      if (persona.voiceProvider === VoiceProvider.HEYGEN && voiceExternalId) {
        const result = await this.heyGenService.generateAvatarVideo(
          metadataId,
          this.requireString(
            persona.avatarExternalId,
            'Persona avatarExternalId',
          ),
          voiceExternalId,
          input.text,
          organizationId,
          userId,
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
