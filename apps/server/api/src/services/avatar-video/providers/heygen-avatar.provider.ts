import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import type {
  AvatarVideoJobInput,
  AvatarVideoJobResult,
  AvatarVideoProvider,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { ByokService } from '@api/services/byok/byok.service';
import { readHeygenVideoStatus } from '@api/services/integrations/heygen/heygen-video-status';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  AvatarVideoProviderName,
  HeyGenGenerationProvider,
} from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HeygenAvatarProvider implements AvatarVideoProvider {
  readonly providerName: AvatarVideoProviderName = 'heygen';
  private readonly logContext = 'HeygenAvatarProvider';

  constructor(
    private readonly heygenService: HeyGenService,
    private readonly byokService: ByokService,
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly apiKeyHelperService: ApiKeyHelperService,
    private readonly prisma: PrismaService,
  ) {}

  async generateVideo(
    input: AvatarVideoJobInput,
  ): Promise<AvatarVideoJobResult> {
    this.logger.log(`${this.logContext} generateVideo`, {
      avatarId: input.avatarId,
      scriptLength: input.script.length,
    });

    try {
      if (
        input.voiceRef?.connection &&
        input.voiceRef.connection.organizationId !== input.organizationId
      )
        throw new Error('This voice belongs to another organization.');
      const selected =
        input.avatarRef ??
        (!input.referenceImageUrl
          ? (await this.heygenService.getAvatars(input.organizationId)).find(
              (item) => item.avatarId === input.avatarId,
            )?.avatarRef
          : undefined);
      if (!input.referenceImageUrl && !selected)
        throw new Error('Select an available trained avatar.');
      const native = selected
        ? await this.heygenService.resolveAvatarSelection(
            selected,
            input.organizationId,
          )
        : undefined;
      const connection =
        native?.connection ??
        (await this.heygenService.resolveOrganizationConnection(
          input.organizationId,
          input.voiceRef?.connection?.kind,
        ));
      const voice = await this.heygenService.validateVoiceSelection(
        input.voiceRef?.externalVoiceId ?? input.voiceId,
        connection,
        input.voiceRef?.ownership,
      );
      if (
        input.voiceRef?.ownership === 'private' &&
        connection.binding.kind !== 'byok'
      )
        throw new Error(
          'Select the personal connection for this private voice.',
        );
      const receipt: HeyGenGenerationProvider = {
        version: 1,
        provider: 'heygen',
        organizationId: input.organizationId,
        connection: connection.binding,
        avatar: native?.avatarRef ?? { source: 'photo' },
        speech: { provider: 'heygen', externalVoiceId: voice.voiceId },
        submissionId: input.callbackId,
      };
      const persisted = await this.prisma.clipResult.updateMany({
        where: {
          id: input.callbackId,
          organizationId: input.organizationId,
          isDeleted: false,
        },
        data: { generationProvider: toPrismaJson(receipt) },
      });
      if (persisted.count !== 1)
        throw new Error('Could not freeze avatar submission provenance.');
      const jobId = input.referenceImageUrl
        ? await this.heygenService.generatePhotoAvatarVideo(
            input.callbackId,
            input.referenceImageUrl,
            { inputText: input.script, voiceId: voice.voiceId },
            input.organizationId,
            input.userId,
            connection.apiKey,
          )
        : await this.heygenService.generateNativeAvatarVideo(
            input.callbackId,
            native?.avatarRef.lookId ?? '',
            { inputText: input.script, voiceId: voice.voiceId },
            connection.apiKey,
          );

      return {
        jobId,
        providerName: this.providerName,
        status: 'processing',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'HeyGen API error';
      this.logger.error(`${this.logContext} generateVideo failed`, error);

      return {
        error: errorMessage,
        jobId: '',
        providerName: this.providerName,
        status: 'failed',
      };
    }
  }

  async getStatus(
    jobId: string,
    organizationId: string,
  ): Promise<AvatarVideoJobResult> {
    let receipt: unknown;
    try {
      const ingredient = await this.prisma.ingredient.findFirst({
        where: {
          organizationId,
          isDeleted: false,
          metadata: { externalId: jobId, externalProvider: 'heygen' },
        },
        select: { generationProvider: true },
      });
      const clip = !ingredient
        ? await this.prisma.clipResult.findFirst({
            where: { providerJobId: jobId, organizationId, isDeleted: false },
            select: { generationProvider: true },
          })
        : null;
      receipt = ingredient?.generationProvider ?? clip?.generationProvider;
    } catch {
      return { jobId, providerName: 'heygen', status: 'unknown' };
    }
    return readHeygenVideoStatus(
      jobId,
      organizationId,
      this.byokService,
      this.apiKeyHelperService,
      this.httpService,
      this.logger,
      15_000,
      receipt,
    );
  }
}
