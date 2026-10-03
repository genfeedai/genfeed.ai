import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import {
  hasMediaRecordAccess,
  MEDIA_DELIVERY_POLICY_VERSION,
  mediaSourceIdentity,
  PLATFORM_PREVIEW_LAYERS,
  protectedPreviewCategory,
  requireStoredMediaKey,
} from '@api/services/media-urls/media-delivery-policy.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import type {
  MediaDeliveryJobData,
  MediaDeliveryPurpose,
  MediaDeliveryScope,
} from '@genfeedai/contracts/interfaces';
import { MEDIA_DELIVERY_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigService } from '@libs/config/config.service';
import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

/** Producer plus durable variant state. Rendering is owned by the worker. */
@Injectable()
export class MediaDerivativePreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issuer: AuthorizedMediaUrlService,
    private readonly files: FilesClientService,
    private readonly config: ConfigService,
    @InjectQueue(MEDIA_DELIVERY_QUEUE)
    private readonly queue: Queue<MediaDeliveryJobData>,
  ) {}

  /** Public reads may enqueue one missing durable variant, never render inline. */
  async enqueuePublicMissing(
    ingredientIds: readonly string[],
    purpose: 'public-share' | 'public-og',
  ): Promise<void> {
    if (
      !isCloudDeployment() ||
      !(
        this.config.isAuthorizedMediaPreparationEnabled ||
        this.config.isAuthorizedMediaDeliveryEnabled
      )
    )
      return;
    const sources = await this.issuer.readPublicSources(
      ingredientIds.slice(0, 50),
    );
    for (const source of sources) {
      if (!source.organizationId || !protectedPreviewCategory(source)) continue;
      const existing = await this.prisma.mediaDeliveryVariant.findFirst({
        where: {
          organizationId: source.organizationId,
          ingredientId: source.id,
          isDeleted: false,
          sourceIdentity: mediaSourceIdentity(source),
          policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
          purpose,
        },
      });
      // A failed render needs explicit authenticated recovery, not perpetual public polling.
      if (!existing || existing.state === 'PENDING')
        await this.enqueue(source.organizationId, source.id, purpose);
    }
  }

  async prepare(
    scope: MediaDeliveryScope,
    ingredientIds: readonly string[],
    purpose: MediaDeliveryPurpose = 'preview',
  ): Promise<void> {
    const sources = await this.issuer.readSources(
      scope.organizationId,
      ingredientIds,
    );
    if (
      sources.length !== new Set(ingredientIds).size ||
      sources.some((source) => !hasMediaRecordAccess(source, scope))
    ) {
      throw new NotFoundException('Media is unavailable');
    }
    if (
      purpose !== 'preview' &&
      (purpose === 'public-social' ||
        (
          await Promise.all(
            sources.map((source) => this.issuer.hasPublicPermission(source)),
          )
        ).some((allowed) => !allowed))
    ) {
      throw new ForbiddenException(
        'This media has no public-delivery permission',
      );
    }
    await Promise.all(
      sources.map((source) =>
        this.enqueue(source.organizationId as string, source.id, purpose),
      ),
    );
  }

  /** Trusted ingestion hook. It does not create a request-selectable bypass. */
  async enqueue(
    organizationId: string,
    ingredientId: string,
    purpose: MediaDeliveryPurpose = 'preview',
  ): Promise<void> {
    if (
      !isCloudDeployment() ||
      !(
        this.config.isAuthorizedMediaPreparationEnabled ||
        this.config.isAuthorizedMediaDeliveryEnabled
      )
    )
      return;
    const [source] = await this.issuer.readSources(organizationId, [
      ingredientId,
    ]);
    if (!source) return;
    if (
      purpose !== 'preview' &&
      (!(await this.issuer.hasPublicPermission(source)) ||
        purpose === 'public-social')
    ) {
      throw new ForbiddenException(
        'This media has no public-delivery permission',
      );
    }
    const sourceIdentity = mediaSourceIdentity(source);
    let isSupported = Boolean(protectedPreviewCategory(source));
    try {
      requireStoredMediaKey(source);
    } catch {
      isSupported = false;
    }
    const identity = {
      ingredientId,
      organizationId,
      policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
      purpose,
      sourceIdentity,
    };
    const variant = await this.prisma.mediaDeliveryVariant.upsert({
      create: {
        ...identity,
        sourceKey: source.s3Key ?? '',
        sourceVersion: source.version,
        state: isSupported ? 'PENDING' : 'UNSUPPORTED',
      },
      update: {},
      where: {
        organizationId,
        isDeleted: false,
        organizationId_ingredientId_sourceIdentity_policyVersion_purpose:
          identity,
      },
    });
    if (!isSupported || variant.state === 'READY') return;
    await this.queue.add(
      'prepare',
      { ingredientId, organizationId, purpose, sourceIdentity },
      {
        attempts: 3,
        backoff: { delay: 30_000, type: 'exponential' },
        jobId: `media-delivery-${variant.id}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async process(data: MediaDeliveryJobData): Promise<void> {
    if (
      !isCloudDeployment() ||
      !(
        this.config.isAuthorizedMediaPreparationEnabled ||
        this.config.isAuthorizedMediaDeliveryEnabled
      )
    )
      return;
    const [source] = await this.issuer.readSources(data.organizationId, [
      data.ingredientId,
    ]);
    // Recheck canonical source and consent after queue delay/retry.
    if (
      !source ||
      mediaSourceIdentity(source) !== data.sourceIdentity ||
      (data.purpose !== 'preview' &&
        (!(await this.issuer.hasPublicPermission(source)) ||
          data.purpose === 'public-social'))
    )
      return;
    const where = {
      ingredientId: data.ingredientId,
      isDeleted: false,
      organizationId: data.organizationId,
      policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
      purpose: data.purpose,
      sourceIdentity: data.sourceIdentity,
    };
    const variant = await this.prisma.mediaDeliveryVariant.findFirst({ where });
    if (!variant || variant.state === 'READY') return;
    const category = protectedPreviewCategory(source);
    if (!category) return;
    await this.prisma.mediaDeliveryVariant.updateMany({
      data: { state: 'PENDING' },
      where: {
        ...where,
        isDeleted: false,
        organizationId: data.organizationId,
      },
    });
    try {
      const preparedPreview =
        data.purpose === 'preview'
          ? null
          : await this.prisma.mediaDeliveryVariant.findFirst({
              where: { ...where, purpose: 'preview', state: 'READY' },
            });
      const reusableKey =
        preparedPreview?.storageKey?.startsWith('exports/watermarked/') &&
        preparedPreview.storageKey !== source.s3Key
          ? preparedPreview.storageKey
          : null;
      const rendered = reusableKey
        ? { storageKey: reusableKey }
        : await this.files.watermarkExport({
            category,
            layers: PLATFORM_PREVIEW_LAYERS.map((layer) => ({ ...layer })),
            storageKey: requireStoredMediaKey(source),
          });
      requireStoredMediaKey({ s3Key: rendered.storageKey });
      if (
        !rendered.storageKey.startsWith('exports/watermarked/') ||
        rendered.storageKey === source.s3Key
      ) {
        throw new Error('Renderer returned an invalid protected variant');
      }
      if (data.purpose !== 'preview' && !reusableKey) {
        const identity = {
          organizationId: data.organizationId,
          ingredientId: data.ingredientId,
          sourceIdentity: data.sourceIdentity,
          policyVersion: MEDIA_DELIVERY_POLICY_VERSION,
          purpose: 'preview',
        };
        await this.prisma.mediaDeliveryVariant.upsert({
          where: {
            organizationId: data.organizationId,
            isDeleted: false,
            organizationId_ingredientId_sourceIdentity_policyVersion_purpose:
              identity,
          },
          create: {
            ...identity,
            sourceKey: requireStoredMediaKey(source),
            sourceVersion: source.version,
            state: 'READY',
            storageKey: rendered.storageKey,
          },
          update: {
            state: 'READY',
            storageKey: rendered.storageKey,
            failureCode: null,
          },
        });
      }
      let storageKey = rendered.storageKey;
      if (data.purpose !== 'preview') {
        storageKey = `public/media/${data.organizationId}/${data.purpose}/${data.sourceIdentity}.${category === 'images' ? 'png' : 'mp4'}`;
        await this.files.copyInS3(rendered.storageKey, storageKey);
      }
      await this.prisma.mediaDeliveryVariant.updateMany({
        data: { failureCode: null, state: 'READY', storageKey },
        where: {
          ...where,
          isDeleted: false,
          organizationId: data.organizationId,
        },
      });
    } catch (error: unknown) {
      await this.prisma.mediaDeliveryVariant.updateMany({
        data: {
          failureCode: 'PREPARATION_FAILED',
          state: 'FAILED',
          storageKey: null,
        },
        where: {
          ...where,
          isDeleted: false,
          organizationId: data.organizationId,
        },
      });
      throw error;
    }
  }
}
