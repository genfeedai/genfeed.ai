import type { StartAvatarTwinDto } from '@api/collections/avatar-twins/dto/start-avatar-twin.dto';
import { deriveAvatarTwinState } from '@api/collections/avatar-twins/utils/avatar-twin-status.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { HeyGenConsentLink } from '@api/services/integrations/heygen/helpers/heygen-twin';
import { HeyGenTwinService } from '@api/services/integrations/heygen/services/heygen-twin.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AvatarTwinStatus, IngredientCategory } from '@genfeedai/contracts';
import type { AvatarTwin, Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
} from '@nestjs/common';

export interface AvatarTwinActor {
  organizationId: string;
  userId: string;
}

const FOOTAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  MOV: 'video/quicktime',
  MP4: 'video/mp4',
  WEBM: 'video/webm',
};

/**
 * Enrollment of a digital twin the person records of themselves (#9683).
 * The twin is created in the workspace's own provider account; this row
 * tracks it from upload until it is ready, across reloads and closed tabs.
 */
@Traced()
@Injectable()
export class AvatarTwinsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly heyGenTwinService: HeyGenTwinService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  list(actor: AvatarTwinActor): Promise<AvatarTwin[]> {
    return this.prisma.avatarTwin.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      where: {
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
  }

  async get(actor: AvatarTwinActor, id: string): Promise<AvatarTwin> {
    const twin = await this.prisma.avatarTwin.findFirst({
      where: {
        id,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
    if (!twin) throw new NotFoundException('Avatar twin', id);
    return twin;
  }

  /**
   * Uploads the recording and starts training. The same idempotency key
   * returns the existing enrollment instead of creating a second avatar.
   */
  async start(
    actor: AvatarTwinActor,
    dto: StartAvatarTwinDto,
  ): Promise<AvatarTwin> {
    const existing = await this.prisma.avatarTwin.findFirst({
      where: {
        idempotencyKey: dto.idempotencyKey,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
    if (existing) return existing;

    const footage = await this.readFootage(actor, dto.sourceIngredientId);

    let twin: AvatarTwin;
    try {
      twin = await this.prisma.avatarTwin.create({
        data: {
          idempotencyKey: dto.idempotencyKey,
          name: dto.name,
          organizationId: actor.organizationId,
          sourceIngredientId: dto.sourceIngredientId,
          status: AvatarTwinStatus.UPLOADING,
          userId: actor.userId,
        },
      });
    } catch (error: unknown) {
      // A concurrent request with the same key won the insert.
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.avatarTwin.findFirst({
          where: {
            idempotencyKey: dto.idempotencyKey,
            isDeleted: false,
            organizationId: actor.organizationId,
            userId: actor.userId,
          },
        });
        if (raced) return raced;
      }
      throw error;
    }

    try {
      const { assetId } = await this.heyGenTwinService.uploadFootage(
        actor.organizationId,
        {
          contentType: footage.contentType,
          filename: `${twin.id}.${footage.extension}`,
          idempotencyKey: `avatar-twin-upload-${twin.id}`,
          sizeBytes: footage.sizeBytes,
          sourceUrl: footage.url,
        },
      );
      const created = await this.heyGenTwinService.createTwin(
        actor.organizationId,
        {
          assetId,
          idempotencyKey: `avatar-twin-create-${twin.id}`,
          name: dto.name,
        },
      );
      const state = deriveAvatarTwinState(created.look, created.group);
      return await this.update(actor, twin.id, {
        ...state,
        lastCheckedAt: new Date(),
        previewImageUrl: created.look.previewImageUrl,
        providerAssetIds: [assetId],
        providerConsent: created.group.consentStatus,
        providerGroupId: created.group.groupId,
        providerLookId: created.look.lookId,
        providerLookStatus: created.look.status,
        supportedEngines: created.look.supportedEngines,
        voiceId: created.look.defaultVoiceId ?? created.group.defaultVoiceId,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} ${CallerUtil.getCallerName()} failed`,
        { errorType: error instanceof Error ? error.name : 'Unknown' },
      );
      await this.update(actor, twin.id, {
        failureCode: 'submission_failed',
        failureMessage:
          error instanceof HttpException || error instanceof Error
            ? error.message
            : 'The recording could not be submitted.',
        status: AvatarTwinStatus.FAILED,
      });
      throw error;
    }
  }

  /** Re-reads training and consent at the provider and stores the result. */
  async refresh(actor: AvatarTwinActor, id: string): Promise<AvatarTwin> {
    const twin = await this.get(actor, id);
    if (!twin.providerLookId || !twin.providerGroupId) return twin;
    if (
      twin.status === AvatarTwinStatus.READY ||
      twin.status === AvatarTwinStatus.FAILED
    )
      return twin;
    const [look, group] = await Promise.all([
      this.heyGenTwinService.getLook(actor.organizationId, twin.providerLookId),
      this.heyGenTwinService.getGroup(
        actor.organizationId,
        twin.providerGroupId,
      ),
    ]);
    const state = deriveAvatarTwinState(look, group);
    return this.update(actor, twin.id, {
      ...state,
      lastCheckedAt: new Date(),
      previewImageUrl: look.previewImageUrl ?? twin.previewImageUrl,
      providerConsent: group.consentStatus,
      providerLookStatus: look.status,
      readyAt:
        state.status === AvatarTwinStatus.READY ? new Date() : twin.readyAt,
      supportedEngines: look.supportedEngines,
      voiceId: twin.voiceId ?? look.defaultVoiceId ?? group.defaultVoiceId,
    });
  }

  /**
   * A fresh link to the provider's consent page. Valid 24 hours; asking again
   * (including after a rejection) issues a new one.
   */
  async requestConsentLink(
    actor: AvatarTwinActor,
    id: string,
    returnPath?: string,
  ): Promise<HeyGenConsentLink> {
    const twin = await this.get(actor, id);
    if (!twin.providerGroupId)
      throw new ConflictException(
        'The recording is still uploading. Try again in a moment.',
      );
    if (twin.status === AvatarTwinStatus.READY)
      throw new ConflictException('Consent was already accepted.');
    if (twin.status === AvatarTwinStatus.FAILED)
      throw new ConflictException(
        'Training failed. Record a new take before giving consent.',
      );
    const link = await this.heyGenTwinService.requestConsentLink(
      actor.organizationId,
      twin.providerGroupId,
      { rerouteUrl: this.rerouteUrl(returnPath) },
    );
    await this.update(actor, twin.id, {
      consentLinkExpiresAt: link.expiresAt,
      ...(twin.status === AvatarTwinStatus.CONSENT_REJECTED
        ? {
            failureCode: null,
            failureMessage: null,
            providerConsent: 'pending',
            status:
              twin.providerLookStatus === 'completed' ||
              twin.providerLookStatus === 'pending_consent'
                ? AvatarTwinStatus.AWAITING_CONSENT
                : AvatarTwinStatus.TRAINING,
          }
        : {}),
    });
    return link;
  }

  /**
   * Deletes the twin at the provider (avatar, source recordings, its voice)
   * and soft-deletes the enrollment. Fails when the provider kept anything,
   * so nothing is left behind silently.
   */
  async remove(actor: AvatarTwinActor, id: string): Promise<AvatarTwin> {
    const twin = await this.get(actor, id);
    if (twin.providerGroupId) {
      const result = await this.heyGenTwinService.deleteTwin(
        actor.organizationId,
        {
          assetIds: twin.providerAssetIds,
          groupId: twin.providerGroupId,
          voiceIds: twin.voiceId ? [twin.voiceId] : [],
        },
      );
      if (result.failed.length > 0)
        throw new ConflictException(
          `HeyGen could not delete everything (${result.failed
            .map((failure) => failure.resource)
            .join(', ')}). Try again.`,
        );
    }
    return this.update(actor, twin.id, { isDeleted: true });
  }

  private update(
    actor: AvatarTwinActor,
    id: string,
    data: Prisma.AvatarTwinUpdateManyMutationInput,
  ): Promise<AvatarTwin> {
    return this.prisma.avatarTwin.update({
      data,
      where: { id, isDeleted: false, organizationId: actor.organizationId },
    });
  }

  /** Only the caller's own take: a twin is the person who recorded it. */
  private async readFootage(actor: AvatarTwinActor, ingredientId: string) {
    const ingredient = await this.prisma.ingredient.findFirst({
      include: { metadata: true },
      where: {
        category: IngredientCategory.VIDEO,
        id: ingredientId,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
    if (!ingredient) throw new NotFoundException('Recording', ingredientId);
    const extension = ingredient.metadata?.extension;
    const contentType = extension
      ? FOOTAGE_CONTENT_TYPES[extension]
      : undefined;
    const url = readIngredientMediaUrl(ingredient);
    const sizeBytes = ingredient.metadata?.size ?? 0;
    if (!contentType || !extension)
      throw new BadRequestException(
        'The recording must be an mp4, webm or mov video.',
      );
    if (!url || sizeBytes <= 0)
      throw new BadRequestException(
        'The recording is not uploaded yet. Try again once it is saved.',
      );
    return {
      contentType,
      extension: extension.toLowerCase(),
      sizeBytes,
      url,
    };
  }

  /** Only a path inside our own app; never an arbitrary host. */
  private rerouteUrl(returnPath?: string): string | undefined {
    const appUrl = this.configService.get('GENFEEDAI_APP_URL');
    if (!appUrl) return undefined;
    const path =
      returnPath?.startsWith('/') && !returnPath.startsWith('//')
        ? returnPath
        : '/';
    try {
      const base = new URL(appUrl);
      const target = new URL(path, base);
      return target.origin === base.origin ? target.toString() : undefined;
    } catch {
      return undefined;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
