import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { Models3dProviderData } from '@api/endpoints/v1/models3d/interfaces/models3d.interfaces';
import {
  MODELS3D_BUILD_TIERS,
  MODELS3D_DEFAULT_QUALITY,
  MODELS3D_DEFAULT_SUBJECT,
} from '@api/endpoints/v1/models3d/models3d.constants';
import { cropAngleSheet } from '@api/endpoints/v1/models3d/utils/grid-tiles.util';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * Starts and abandons the GLB build of a 3D render. It is the worker-safe half
 * of the pipeline: the API creates and funds the GLB child ingredient, then the
 * poll worker calls `startBuild` once the angle sheet is stored.
 */
@Traced()
@Injectable()
export class Models3dBuildService {
  private readonly logContext = 'Models3dBuildService';

  constructor(
    private readonly filesClient: FilesClientService,
    private readonly ingredients: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadata: MetadataService,
    private readonly pollQueue: ReplicatePollQueueService,
    private readonly replicate: ReplicateService,
    private readonly webhooks: WebhooksService,
  ) {}

  /**
   * Builds the GLB for a stored angle sheet. A failure fails the funded GLB
   * child and refunds its hold; it never throws, so a build problem cannot
   * undo the finished sheet.
   */
  async startBuild(sheetId: string): Promise<void> {
    const child = await this.findActiveChild(sheetId);
    if (!child) return;

    try {
      const sheet = await this.ingredients.findOneSelect(
        { id: sheetId, isDeleted: false },
        { organizationId: true, providerData: true, s3Key: true },
      );
      if (!sheet?.s3Key) {
        throw new Error('The angle sheet has no stored image');
      }

      const sheetUrl =
        await this.filesClient.getPresignedDownloadUrlForObjectKey(sheet.s3Key);
      const sheetBuffer = await this.download(sheetUrl);
      const source = (
        sheet.providerData as Partial<Models3dProviderData> | null
      )?.models3d;
      const tier =
        MODELS3D_BUILD_TIERS[source?.quality ?? MODELS3D_DEFAULT_QUALITY];
      const views = tier.viewIndexes;
      const allTiles = await cropAngleSheet(sheetBuffer);
      const tiles = views
        ? views.flatMap((index) =>
            allTiles.filter((tile) => tile.index === index),
          )
        : allTiles;

      const tileUrls: string[] = [];
      for (const tile of tiles) {
        const stored = await this.filesClient.uploadToS3(
          `${child.id}-view-${tile.index}`,
          'images',
          {
            contentType: 'image/png',
            data: tile.data,
            type: FileInputType.BUFFER,
          },
        );
        if (!stored.s3Key) {
          throw new Error('A cropped view has no storage key');
        }
        tileUrls.push(
          await this.filesClient.getPresignedDownloadUrlForObjectKey(
            stored.s3Key,
          ),
        );
      }

      const sourceUrl = await this.resolveSourceUrl(sheet.providerData);
      const externalId = await this.replicate.runModel(
        tier.modelKey,
        {
          ...tier.input,
          images: [sourceUrl, ...tileUrls],
          ...(tier.isPromptRequired
            ? { prompt: source?.prompt?.trim() || MODELS3D_DEFAULT_SUBJECT }
            : {}),
        },
        undefined,
        undefined,
        undefined,
        false,
      );

      await this.metadata.patch(
        child.metadataId,
        new MetadataEntity({ externalId, externalProvider: 'replicate' }),
      );

      const jobId = await this.pollQueue.schedule({
        category: IngredientCategory.MODEL_3D,
        externalId,
        ingredientId: child.id,
        organizationId: child.organizationId,
        ...(tier.outputKey ? { outputKey: tier.outputKey } : {}),
      });
      if (!jobId) {
        throw new Error('The build poll could not be scheduled');
      }
    } catch (error: unknown) {
      this.loggerService.error(`${this.logContext} startBuild failed`, error, {
        childId: child.id,
        sheetId,
      });
      await this.failChild(child.id, 'The 3D build could not be started');
    }
  }

  /** Fails the funded GLB child, refunding its hold, once its sheet failed. */
  async abandonBuild(sheetId: string): Promise<void> {
    const child = await this.findActiveChild(sheetId);
    if (!child) return;
    await this.failChild(child.id, 'The angle sheet could not be rendered');
  }

  private async findActiveChild(sheetId: string) {
    const children = await this.ingredients.find({
      category: IngredientCategory.MODEL_3D,
      isDeleted: false,
      parentId: sheetId,
      status: IngredientStatus.PROCESSING,
    });
    const [child] = [...children].sort(
      (a, b) =>
        new Date(b.createdAt as Date).getTime() -
        new Date(a.createdAt as Date).getTime(),
    );
    if (!child) return null;
    return {
      id: child.id.toString(),
      metadataId: child.metadataId as string,
      organizationId: child.organizationId as string,
    };
  }

  private async failChild(childId: string, message: string): Promise<void> {
    try {
      await this.webhooks.handleFailedGenerationForIngredient(childId, message);
    } catch (error: unknown) {
      this.loggerService.error(`${this.logContext} failChild failed`, error, {
        childId,
      });
    }
  }

  private async resolveSourceUrl(providerData: unknown): Promise<string> {
    const source = (providerData as Partial<Models3dProviderData> | null)
      ?.models3d;
    if (source?.sourceS3Key) {
      return this.filesClient.getPresignedDownloadUrlForObjectKey(
        source.sourceS3Key,
      );
    }
    if (source?.sourceImageUrl) return source.sourceImageUrl;
    throw new Error('The render has no source image');
  }

  private async download(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Downloading the angle sheet failed: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
}
