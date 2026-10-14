import { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import {
  ElevenLabsConnectionService,
  type ResolvedElevenLabsConnection,
} from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import type { ElevenLabsSpeechReceipt } from '@genfeedai/contracts/interfaces';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/**
 * Binds ElevenLabs speech to the voice and the account that owns it, and
 * guards the paid provider call so it is sent at most once per asset.
 */
@Injectable()
export class ElevenLabsSpeechBindingService {
  constructor(
    private readonly accountVoicesService: ElevenLabsAccountVoicesService,
    private readonly connectionService: ElevenLabsConnectionService,
    private readonly voicesService: VoicesService,
  ) {}

  /** Binds the voice and the account that will speak it, before any work. */
  async bind(
    organizationId: string,
    voiceId: string,
  ): Promise<ElevenLabsSpeechReceipt> {
    const voice = await this.accountVoicesService.resolveSpeechVoice(
      organizationId,
      voiceId,
    );
    const connection = await this.connectionService.resolve(
      organizationId,
      voice.connectionKind,
    );
    return {
      connection: connection.binding,
      organizationId,
      provider: 'elevenlabs',
      state: 'accepted',
      version: 1,
      voice: {
        externalVoiceId: voice.externalVoiceId,
        ...(voice.internalVoiceId
          ? { internalVoiceId: voice.internalVoiceId }
          : {}),
      },
    };
  }

  /** The submitting account must still be the bound one. */
  async resolveBoundConnection(
    receipt: ElevenLabsSpeechReceipt,
  ): Promise<ResolvedElevenLabsConnection> {
    const connection = await this.connectionService.resolve(
      receipt.organizationId,
      receipt.connection.kind,
    );
    if (
      receipt.connection.kind === 'byok' &&
      connection.binding.credentialVersionId !==
        receipt.connection.credentialVersionId
    ) {
      throw new BadRequestException(
        'The ElevenLabs connection changed after this voice was requested. Generate it again.',
      );
    }
    return connection;
  }

  /**
   * One-way claim on the paid provider call. A retry that finds the request
   * already submitted without stored audio cannot know whether ElevenLabs
   * produced (and billed) it, so it fails instead of sending it again.
   */
  async claimSubmission(
    ingredientId: string,
    receipt: ElevenLabsSpeechReceipt,
    hasStoredReceipt: boolean,
  ): Promise<void> {
    const { count } = await this.voicesService.prisma.ingredient.updateMany({
      data: {
        generationProvider: toPrismaJson({ ...receipt, state: 'submitted' }),
      },
      where: {
        generationProvider: hasStoredReceipt
          ? { equals: 'accepted', path: ['state'] }
          : { equals: Prisma.DbNull },
        id: ingredientId,
        isDeleted: false,
        organizationId: receipt.organizationId,
      },
    });
    if (count === 0) {
      throw new ConflictException(
        'An earlier attempt of this voice generation has an unknown result, so it was not sent again. Generate it again.',
      );
    }
  }
}
