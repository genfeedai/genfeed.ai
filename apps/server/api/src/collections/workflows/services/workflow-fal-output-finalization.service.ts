import { randomUUID } from 'node:crypto';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { WorkflowNodeContinuationService } from '@api/collections/workflows/services/workflow-node-continuation.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { workflowExecutionGenerationBillingSchema } from '@api/helpers/utils/credits/workflow-generation-billing.schema';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IFileMetadata } from '@genfeedai/contracts/interfaces';
import { Prisma, WorkflowNodeContinuationStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const INGESTION_LEASE_MS = 15 * 60 * 1000;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Accepted provider URLs are ingested again after a file failure, never submitted to the provider again. */
@Injectable()
export class WorkflowFalOutputFinalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly continuations: WorkflowNodeContinuationService,
    private readonly files: FilesClientService,
    private readonly webhooks: WebhooksService,
    private readonly metadata: MetadataService,
    private readonly logger: LoggerService,
  ) {}

  private async verifyStoredOutput(
    uploaded: Pick<
      IFileMetadata,
      's3Key' | 'width' | 'height' | 'duration' | 'size'
    >,
    ceiling: {
      width?: number;
      height?: number;
      duration?: number;
      framesPerSecond?: number;
    },
    identity: {
      continuationId: string;
      organizationId: string;
      ingredientId: string;
      externalId: string;
      metadataId: string;
    },
  ): Promise<void> {
    if (!uploaded.s3Key)
      throw new Error('Accepted Fal output has no stored object identity');
    const url = await this.files.getPresignedDownloadUrlForObjectKey(
      uploaded.s3Key,
    );
    const before = await this.files.fingerprintMedia(url);
    const probe = await this.files.probeMediaFromUrl(url, 'video');
    const after = await this.files.fingerprintMedia(url);
    if (
      before.assetHash !== after.assetHash ||
      before.sizeBytes !== after.sizeBytes ||
      probe.sizeBytes !== after.sizeBytes ||
      !probe.width ||
      !probe.height ||
      !probe.durationSeconds ||
      !probe.frameRate ||
      probe.width !== uploaded.width ||
      probe.height !== uploaded.height ||
      probe.durationSeconds !== uploaded.duration ||
      after.sizeBytes !== uploaded.size
    )
      throw new Error(
        'Accepted Fal output has no matching stable stored video',
      );
    if (
      (ceiling.width !== undefined && probe.width > ceiling.width) ||
      (ceiling.height !== undefined && probe.height > ceiling.height) ||
      (ceiling.duration !== undefined &&
        probe.durationSeconds > ceiling.duration) ||
      (ceiling.framesPerSecond !== undefined &&
        probe.frameRate > ceiling.framesPerSecond)
    )
      throw new Error('Accepted Fal output exceeds its funded quantities');
    await this.continuations.recordFalOutputMeasurement({
      continuationId: identity.continuationId,
      organizationId: identity.organizationId,
      ingredientId: identity.ingredientId,
      externalId: identity.externalId,
      measurement: {
        width: probe.width,
        height: probe.height,
        duration: probe.durationSeconds,
        framesPerSecond: probe.frameRate,
        assetHash: after.assetHash,
        sizeBytes: after.sizeBytes,
        assetKey: uploaded.s3Key,
      },
    });
    await this.metadata.patch(
      identity.metadataId,
      new MetadataEntity({ fps: probe.frameRate }),
    );
  }

  private async releaseIngestionLease(
    continuationId: string,
    organizationId: string,
    leaseId: string,
  ): Promise<void> {
    try {
      const current = await this.prisma.workflowNodeContinuation.findFirst({
        select: { providerResult: true },
        where: { id: continuationId, organizationId },
      });
      const { falOutputIngestion: _lease, ...result } = record(
        current?.providerResult,
      );
      await this.prisma.workflowNodeContinuation.updateMany({
        where: {
          id: continuationId,
          organizationId: organizationId,
          providerResult: {
            path: ['falOutputIngestion', 'leaseId'],
            equals: leaseId,
          },
        },
        data: { providerResult: result as Prisma.InputJsonValue },
      });
    } catch (error: unknown) {
      this.logger.error(
        'Workflow Fal ingestion lease release remains recoverable',
        error,
        { continuationId, organizationId },
      );
    }
  }

  async reconcile(): Promise<void> {
    // tenant-scope-ignore: bounded platform backstop discovers persisted owners, then each attempt reloads that exact tenant.
    const rows = await this.prisma.workflowNodeContinuation.findMany({
      select: { id: true, organizationId: true },
      take: 100,
      orderBy: { updatedAt: 'asc' },
      where: {
        provider: 'fal',
        actionId: 'videoGen',
        externalId: { not: null },
        status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      },
    });
    for (const row of rows) await this.finalize(row.id, row.organizationId);
  }

  async finalize(
    continuationId: string,
    organizationId: string,
  ): Promise<boolean> {
    const row = await this.prisma.workflowNodeContinuation.findFirst({
      where: {
        id: continuationId,
        organizationId: organizationId,
        provider: 'fal',
        actionId: 'videoGen',
        status: WorkflowNodeContinuationStatus.WAITING_PROVIDER,
      },
    });
    if (!row?.externalId) return false;
    const original = record(row.providerResult);
    if (record(original.acceptedFalOutput).externalId !== row.externalId)
      return false;
    const lease = record(original.falOutputIngestion);
    if (
      typeof lease.startedAt === 'string' &&
      Date.now() - Date.parse(lease.startedAt) < INGESTION_LEASE_MS
    )
      return false;
    const leaseId = randomUUID();
    const claimed = await this.prisma.workflowNodeContinuation.updateMany({
      where: {
        id: row.id,
        organizationId: organizationId,
        status: row.status,
        updatedAt: row.updatedAt,
      },
      data: {
        providerResult: {
          ...original,
          falOutputIngestion: { leaseId, startedAt: new Date().toISOString() },
        } as Prisma.InputJsonValue,
      },
    });
    if (claimed.count !== 1) return false;
    try {
      const artifact = await this.prisma.ingredient.findFirst({
        include: { metadata: true },
        where: {
          id: row.ingredientId,
          organizationId: organizationId,
          isDeleted: false,
          category: IngredientCategory.VIDEO,
        },
      });
      const execution = await this.prisma.workflowExecution.findFirst({
        select: { generationBilling: true },
        where: {
          id: row.executionId,
          organizationId: organizationId,
          workflowVersionId: row.workflowVersionId,
          isDeleted: false,
        },
      });
      if (!artifact?.metadata || !execution)
        throw new Error('Accepted Fal output owner is unavailable');
      const artifactMetadata = artifact.metadata;
      const acceptedExternalId = row.externalId;
      const funding = workflowExecutionGenerationBillingSchema.parse(
        execution.generationBilling,
      );
      const allocation = funding.manifest.allocations.find(
        (item) =>
          item.nodeId === row.nodeId &&
          item.actionId === row.actionId &&
          item.dispatch.provider === 'fal',
      );
      if (
        !allocation ||
        funding.manifest.executionId !== row.executionId ||
        funding.manifest.organizationId !== organizationId
      )
        throw new Error('Accepted Fal output has no matching funded operation');
      const verify = async (
        uploaded: Pick<
          IFileMetadata,
          's3Key' | 'width' | 'height' | 'duration' | 'size'
        >,
      ): Promise<void> => {
        await this.verifyStoredOutput(
          uploaded,
          allocation.dispatch.quantities,
          {
            continuationId,
            organizationId,
            ingredientId: row.ingredientId,
            externalId: acceptedExternalId,
            metadataId: artifactMetadata.id,
          },
        );
      };
      if (artifact.status === IngredientStatus.PROCESSING) {
        await this.webhooks.processMediaForIngredient(
          row.ingredientId,
          IngredientCategory.VIDEO,
          row.externalId,
          row.externalId,
          { beforeFinalize: verify },
        );
      } else if (
        artifact.status === IngredientStatus.GENERATED ||
        artifact.status === IngredientStatus.VALIDATED
      ) {
        await verify({
          s3Key: artifact.s3Key ?? undefined,
          width: artifactMetadata.width,
          height: artifactMetadata.height,
          duration: artifactMetadata.duration,
          size: artifactMetadata.size,
        });
      } else throw new Error('Accepted Fal output is no longer finalizable');
      const stored = await this.prisma.ingredient.findFirst({
        select: { s3Key: true, status: true },
        where: {
          id: row.ingredientId,
          organizationId: organizationId,
          isDeleted: false,
          category: IngredientCategory.VIDEO,
        },
      });
      if (
        !stored?.s3Key ||
        (stored.status !== IngredientStatus.GENERATED &&
          stored.status !== IngredientStatus.VALIDATED)
      )
        throw new Error('Accepted Fal output has not completed storage');
      await this.continuations.recordProviderSettlement({
        identity: { continuationId, organizationId },
        provider: 'fal',
        providerResult: { externalId: row.externalId },
        succeeded: true,
      });
      return true;
    } catch (error: unknown) {
      this.logger.error(
        'Workflow Fal output ingestion remains recoverable',
        error,
        { continuationId, organizationId },
      );
      return false;
    } finally {
      await this.releaseIngestionLease(continuationId, organizationId, leaseId);
    }
  }
}
