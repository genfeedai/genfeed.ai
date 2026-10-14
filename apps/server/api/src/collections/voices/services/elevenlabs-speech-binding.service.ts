import { ElevenLabsAccountVoicesService } from '@api/collections/voices/services/elevenlabs-account-voices.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { readSpeechReceipt } from '@api/collections/voices/utils/elevenlabs-voice-binding.schema';
import {
  ElevenLabsConnectionService,
  type ResolvedElevenLabsConnection,
} from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { IngredientStatus } from '@genfeedai/contracts';
import type { ElevenLabsSpeechReceipt } from '@genfeedai/contracts/interfaces';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/**
 * How long a claimed provider call counts as in flight: well above the
 * synthesis and upload time, so only a crashed attempt outlives it.
 */
export const SPEECH_SUBMISSION_LEASE_MS = 10 * 60 * 1000;

export type SpeechSubmissionClaim = 'claimed' | 'in-flight';

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
   * One-way claim on the paid provider call. A duplicate job that finds a
   * fresh claim on audio still processing leaves it to that attempt. A claim
   * older than the lease without stored audio has an unknown result: whether
   * ElevenLabs produced (and billed) it cannot be known, so it fails instead
   * of sending it again.
   */
  async claimSubmission(
    ingredientId: string,
    receipt: ElevenLabsSpeechReceipt,
    hasStoredReceipt: boolean,
  ): Promise<SpeechSubmissionClaim> {
    const { count } = await this.voicesService.prisma.ingredient.updateMany({
      data: {
        generationProvider: toPrismaJson({
          ...receipt,
          state: 'submitted',
          submittedAt: new Date().toISOString(),
        }),
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
    if (count === 1) {
      return 'claimed';
    }
    if (await this.isSubmissionInFlight(ingredientId, receipt.organizationId)) {
      return 'in-flight';
    }
    throw new ConflictException(
      'An earlier attempt of this voice generation has an unknown result, so it was not sent again. Generate it again.',
    );
  }

  private async isSubmissionInFlight(
    ingredientId: string,
    organizationId: string,
  ): Promise<boolean> {
    const current = await this.voicesService.prisma.ingredient.findFirst({
      select: { generationProvider: true, s3Key: true, status: true },
      where: { id: ingredientId, isDeleted: false, organizationId },
    });
    const submitted = readSpeechReceipt(current?.generationProvider);
    const submittedAt = submitted?.submittedAt
      ? Date.parse(submitted.submittedAt)
      : Number.NaN;
    return (
      current?.status === IngredientStatus.PROCESSING &&
      !current.s3Key &&
      submitted?.state === 'submitted' &&
      Date.now() - submittedAt < SPEECH_SUBMISSION_LEASE_MS
    );
  }
}
