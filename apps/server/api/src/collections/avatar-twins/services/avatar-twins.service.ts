import type { StartAvatarTwinDto } from '@api/collections/avatar-twins/dto/start-avatar-twin.dto';
import {
  AVATAR_TWIN_WAITING_STATUSES,
  deriveAvatarTwinState,
} from '@api/collections/avatar-twins/utils/avatar-twin-status.util';
import {
  AVATAR_TWIN_NOTIFICATION_KIND,
  AVATAR_TWIN_TRACKING_BATCH,
  AVATAR_TWIN_TRACKING_MAX_AGE_MS,
  AVATAR_TWIN_UPLOAD_STALE_MS,
  type AvatarTwinNotificationPayload,
  isAvatarTwinTrackingDue,
} from '@api/collections/avatar-twins/utils/avatar-twin-tracking.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { HeyGenConsentLink } from '@api/services/integrations/heygen/helpers/heygen-twin';
import { HeyGenTwinService } from '@api/services/integrations/heygen/services/heygen-twin.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  AvatarTwinStatus,
  IngredientCategory,
} from '@genfeedai/contracts';
import { type AvatarTwin, Prisma } from '@genfeedai/prisma';
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

export interface AvatarTwinTrackingTotals {
  checked: number;
  failed: number;
  interrupted: number;
}

const AVATAR_TWIN_SOURCE_TYPE = 'avatar_twin';
const AVATAR_TWIN_ENTITY_MODEL = 'AvatarTwin';

const SETTLED_STATUSES: readonly AvatarTwinStatus[] = [
  AvatarTwinStatus.CONSENT_REJECTED,
  AvatarTwinStatus.FAILED,
  AvatarTwinStatus.READY,
];

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
    private readonly activityRecorder: ActivityRecorderService,
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
      if (!dto.isRecordingKept)
        await this.prisma.ingredient.updateMany({
          data: { isDeleted: true },
          where: {
            id: dto.sourceIngredientId,
            isDeleted: false,
            organizationId: actor.organizationId,
            userId: actor.userId,
          },
        });
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
    const updated = await this.update(actor, twin.id, {
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
    if (updated.status !== twin.status) await this.notifySettled(updated);
    return updated;
  }

  /**
   * The background check (#9683): re-reads every waiting twin that is due,
   * across workspaces, so a twin settles and its owner hears about it with
   * the tab closed. Uploads that never reached the provider are failed.
   */
  async trackWaiting(now = new Date()): Promise<AvatarTwinTrackingTotals> {
    const totals: AvatarTwinTrackingTotals = {
      checked: 0,
      failed: 0,
      interrupted: 0,
    };

    // tenant-scope-ignore: platform sweep; each row is updated under its own organization below
    const interrupted = await this.prisma.avatarTwin.findMany({
      take: AVATAR_TWIN_TRACKING_BATCH,
      where: {
        createdAt: {
          lt: new Date(now.getTime() - AVATAR_TWIN_UPLOAD_STALE_MS),
        },
        isDeleted: false,
        providerLookId: null,
        status: AvatarTwinStatus.UPLOADING,
      },
    });
    for (const twin of interrupted) {
      const failed = await this.update(ownerOf(twin), twin.id, {
        failureCode: 'submission_interrupted',
        failureMessage:
          'The upload stopped before HeyGen received it. Submit the recording again.',
        status: AvatarTwinStatus.FAILED,
      });
      await this.notifySettled(failed);
      totals.interrupted += 1;
    }

    // tenant-scope-ignore: platform sweep; each twin is refreshed as its owner, inside its own organization
    const waiting = await this.prisma.avatarTwin.findMany({
      orderBy: { lastCheckedAt: { nulls: 'first', sort: 'asc' } },
      select: {
        createdAt: true,
        id: true,
        lastCheckedAt: true,
        organizationId: true,
        userId: true,
      },
      take: AVATAR_TWIN_TRACKING_BATCH * 4,
      where: {
        createdAt: {
          gte: new Date(now.getTime() - AVATAR_TWIN_TRACKING_MAX_AGE_MS),
        },
        isDeleted: false,
        providerLookId: { not: null },
        status: { in: [...AVATAR_TWIN_WAITING_STATUSES] },
      },
    });
    const due = waiting
      .filter((twin) => isAvatarTwinTrackingDue(twin, now))
      .slice(0, AVATAR_TWIN_TRACKING_BATCH);
    for (const twin of due) {
      totals.checked += 1;
      try {
        await this.refresh(ownerOf(twin), twin.id);
      } catch (error: unknown) {
        // A disconnected key or a provider outage: wait for the next step
        // instead of retrying this twin on every sweep.
        totals.failed += 1;
        this.loggerService.warn(`${this.constructorName} tracking failed`, {
          error: error instanceof Error ? error.message : 'Unknown',
          organizationId: twin.organizationId,
          twinId: twin.id,
        });
        await this.update(ownerOf(twin), twin.id, { lastCheckedAt: now });
      }
    }
    return totals;
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
    await this.clearIdentityDefaults(actor, twin);
    return this.update(actor, twin.id, { isDeleted: true });
  }

  /**
   * A deleted twin can no longer render: brand and organization defaults
   * that point at its look or voice are cleared, so videos fall back to the
   * next default instead of failing at the provider.
   */
  private async clearIdentityDefaults(
    actor: AvatarTwinActor,
    twin: AvatarTwin,
  ): Promise<void> {
    const cleared = (config: unknown): Record<string, unknown> | null => {
      if (!config || typeof config !== 'object' || Array.isArray(config))
        return null;
      const record = config as Record<string, unknown>;
      const isTwinLook =
        !!twin.providerLookId &&
        readField(record.defaultAvatarRef, 'lookId') === twin.providerLookId;
      const isTwinVoice =
        !!twin.voiceId &&
        readField(record.defaultVoiceRef, 'externalVoiceId') === twin.voiceId;
      if (!isTwinLook && !isTwinVoice) return null;
      return {
        ...(isTwinLook ? { defaultAvatarRef: null } : {}),
        ...(isTwinVoice ? { defaultVoiceRef: null } : {}),
      };
    };

    const brands = await this.prisma.brand.findMany({
      select: { agentConfig: true, id: true },
      where: { isDeleted: false, organizationId: actor.organizationId },
    });
    for (const brand of brands) {
      const change = cleared(brand.agentConfig);
      if (!change) continue;
      await this.prisma.brand.update({
        data: {
          agentConfig: {
            ...(brand.agentConfig as Record<string, unknown>),
            ...change,
          } as Prisma.InputJsonValue,
        },
        where: {
          id: brand.id,
          isDeleted: false,
          organizationId: actor.organizationId,
        },
      });
    }

    const settings = await this.prisma.organizationSetting.findFirst({
      select: { defaultAvatarRef: true, defaultVoiceRef: true, id: true },
      where: { organizationId: actor.organizationId },
    });
    const settingsChange = settings ? cleared(settings) : null;
    if (settings && settingsChange)
      await this.prisma.organizationSetting.update({
        data: {
          ...(settingsChange.defaultAvatarRef === null
            ? { defaultAvatarRef: Prisma.DbNull }
            : {}),
          ...(settingsChange.defaultVoiceRef === null
            ? { defaultVoiceRef: Prisma.DbNull }
            : {}),
        },
        where: { id: settings.id },
      });
  }

  /**
   * Tells the person who recorded the twin once it is ready, or once it
   * failed or its consent was declined. One bell item per twin and outcome;
   * a failed alert never fails the status change itself.
   */
  private async notifySettled(twin: AvatarTwin): Promise<void> {
    if (!SETTLED_STATUSES.includes(twin.status as AvatarTwinStatus)) return;
    const isReady = twin.status === AvatarTwinStatus.READY;
    const key = isReady
      ? ActivityKey.AVATAR_TWIN_TRAINING_COMPLETED
      : ActivityKey.AVATAR_TWIN_TRAINING_FAILED;
    try {
      const brandId = await this.linkBrandId(ownerOf(twin));
      const payload: AvatarTwinNotificationPayload = {
        brandId,
        kind: AVATAR_TWIN_NOTIFICATION_KIND,
        status: twin.status as AvatarTwinStatus,
        twinId: twin.id,
        version: 1,
      };
      await this.activityRecorder.record({
        alert: {
          deduplicationKey: `${key}/${twin.id}/${twin.status}`,
          payload: { ...payload },
          source: { id: twin.id, type: AVATAR_TWIN_SOURCE_TYPE },
        },
        brandId,
        entityId: twin.id,
        entityModel: AVATAR_TWIN_ENTITY_MODEL,
        key,
        organizationId: twin.organizationId,
        source: ActivitySource.AVATAR_GENERATION,
        userId: twin.userId,
        value: describeSettledTwin(twin),
      });
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName} notify failed`, {
        error: error instanceof Error ? error.message : 'Unknown',
        twinId: twin.id,
      });
    }
  }

  /** The person's first assigned brand, else the workspace's first brand. */
  private async linkBrandId(actor: AvatarTwinActor): Promise<string | null> {
    const member = await this.prisma.member.findFirst({
      select: {
        brands: {
          orderBy: { createdAt: 'asc' },
          select: { id: true },
          take: 1,
          where: { isDeleted: false, organizationId: actor.organizationId },
        },
      },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: actor.organizationId,
        userId: actor.userId,
      },
    });
    const assigned = member?.brands[0]?.id;
    if (assigned) return assigned;
    const brand = await this.prisma.brand.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: { isDeleted: false, organizationId: actor.organizationId },
    });
    return brand?.id ?? null;
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

function ownerOf(twin: {
  organizationId: string;
  userId: string;
}): AvatarTwinActor {
  return { organizationId: twin.organizationId, userId: twin.userId };
}

/** The bell line under the title; the name is the person's own. */
function describeSettledTwin(twin: AvatarTwin): string {
  const reason = twin.failureMessage ? ` ${twin.failureMessage}` : '';
  switch (twin.status) {
    case AvatarTwinStatus.READY:
      return `“${twin.name}” is ready. Use it in a video or as a brand's default avatar.`;
    case AvatarTwinStatus.CONSENT_REJECTED:
      return `HeyGen declined the consent for “${twin.name}”.${reason} Ask for a new consent link and try again.`;
    default:
      return `“${twin.name}” could not be trained.${reason} Record a new take.`;
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

function readField(value: unknown, key: string): unknown {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
