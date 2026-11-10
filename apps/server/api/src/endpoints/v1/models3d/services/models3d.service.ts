import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { CreateModel3dDto } from '@api/endpoints/v1/models3d/dto/create-model3d.dto';
import type {
  Models3dProviderData,
  Models3dResponse,
  Models3dStatus,
} from '@api/endpoints/v1/models3d/interfaces/models3d.interfaces';
import {
  buildModels3dSheetPrompt,
  MODELS3D_BUILD_MODEL_KEY,
  MODELS3D_SHEET_ASPECT_RATIO,
  MODELS3D_SHEET_MODEL_KEY,
  MODELS3D_SHEET_RESOLUTION,
} from '@api/endpoints/v1/models3d/models3d.constants';
import { Models3dBillingService } from '@api/endpoints/v1/models3d/services/models3d-billing.service';
import { Models3dBuildService } from '@api/endpoints/v1/models3d/services/models3d-build.service';
import { WebhooksService } from '@api/endpoints/webhooks/webhooks.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ReplicatePollQueueService } from '@api/queues/replicate-poll/replicate-poll-queue.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  FileInputType,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

export interface Models3dActor {
  brandId?: string;
  organizationId: string;
  userId: string;
}

export interface Models3dUpload {
  buffer: Buffer;
  mimetype: string;
}

type SheetRow = NonNullable<Awaited<ReturnType<IngredientsService['findOne']>>>;

/**
 * A 3D render is two paid steps: a 3x3 angle sheet from an image model, then
 * a GLB built from the photo and the sheet views. The sheet is an image
 * ingredient and its id is the render id; the GLB is its MODEL_3D child.
 */
@Traced()
@Injectable()
export class Models3dService {
  private readonly logContext = 'Models3dService';

  constructor(
    private readonly billing: Models3dBillingService,
    private readonly build: Models3dBuildService,
    private readonly filesClient: FilesClientService,
    private readonly ingredients: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadata: MetadataService,
    private readonly pollQueue: ReplicatePollQueueService,
    private readonly replicate: ReplicateService,
    private readonly shared: SharedService,
    private readonly webhooks: WebhooksService,
  ) {}

  async create(
    actor: Models3dActor,
    dto: CreateModel3dDto,
    upload?: Models3dUpload,
  ): Promise<Models3dResponse> {
    if (Boolean(dto.imageUrl) === Boolean(upload)) {
      throw new BadRequestException('Provide exactly one of imageUrl or file');
    }
    const withBuild = dto.build === true;

    // Price first: unavailable pricing returns 503 before any row exists.
    const quote = await this.billing.quote(actor.organizationId);

    const sheet = await this.shared.createMediaDocumentsInternal({
      brandId: actor.brandId ?? '',
      category: IngredientCategory.IMAGE,
      extension: MetadataExtension.PNG,
      generationPrompt: dto.prompt,
      generationSource: 'models3d:sheet',
      model: MODELS3D_SHEET_MODEL_KEY,
      organizationId: actor.organizationId,
      origin: IngredientOrigin.GENERATED,
      providerData: this.providerData({
        credits: quote.sheet,
        prompt: dto.prompt,
        sourceImageUrl: dto.imageUrl,
      }),
      status: IngredientStatus.PROCESSING,
      userId: actor.userId,
    });
    const sheetId = sheet.ingredientData.id.toString();
    const sheetMetadataId = sheet.metadataData.id.toString();

    let childId: string | undefined;
    try {
      await this.billing.hold({
        brandId: actor.brandId,
        credits: quote.sheet,
        ingredientId: sheetId,
        organizationId: actor.organizationId,
        step: 'sheet',
        userId: actor.userId,
      });
      if (withBuild) {
        childId = await this.createFundedChild(actor, sheetId, quote.build);
      }
    } catch (error: unknown) {
      await this.discard(actor, [sheetId, childId]);
      throw error;
    }

    try {
      let sourceUrl = dto.imageUrl;
      let sourceS3Key: string | undefined;
      if (upload) {
        const stored = await this.filesClient.uploadToS3(
          `${sheetId}-source`,
          'images',
          {
            contentType: upload.mimetype,
            data: upload.buffer,
            type: FileInputType.BUFFER,
          },
        );
        if (!stored.s3Key) {
          throw new Error('The uploaded source image has no storage key');
        }
        sourceS3Key = stored.s3Key;
        sourceUrl = await this.filesClient.getPresignedDownloadUrlForObjectKey(
          stored.s3Key,
        );
        await this.ingredients.patch(sheetId, {
          providerData: this.providerData({
            credits: quote.sheet,
            prompt: dto.prompt,
            sourceS3Key,
          }),
        });
      }

      const externalId = await this.replicate.runModel(
        MODELS3D_SHEET_MODEL_KEY,
        {
          aspect_ratio: MODELS3D_SHEET_ASPECT_RATIO,
          image_input: [sourceUrl],
          output_format: 'png',
          prompt: buildModels3dSheetPrompt(dto.prompt),
          resolution: MODELS3D_SHEET_RESOLUTION,
          safety_filter_level: 'block_only_high',
        },
        undefined,
        undefined,
        undefined,
        false,
      );
      await this.metadata.patch(
        sheetMetadataId,
        new MetadataEntity({ externalId, externalProvider: 'replicate' }),
      );
      const jobId = await this.pollQueue.schedule({
        category: IngredientCategory.IMAGE,
        ...(withBuild ? { chain: { kind: 'models3d-build' as const } } : {}),
        externalId,
        ingredientId: sheetId,
        organizationId: actor.organizationId,
      });
      if (!jobId) {
        throw new Error('The sheet poll could not be scheduled');
      }
    } catch (error: unknown) {
      this.loggerService.error(`${this.logContext} create failed`, error, {
        sheetId,
      });
      await this.webhooks.handleFailedGenerationForIngredient(
        sheetId,
        'The angle sheet could not be started',
      );
      await this.build.abandonBuild(sheetId);
      throw new BadGatewayException('The 3D render could not be started');
    }

    return this.get(actor, sheetId);
  }

  async get(actor: Models3dActor, id: string): Promise<Models3dResponse> {
    const sheet = await this.loadSheet(actor, id);
    const children = await this.loadChildren(actor, id);
    return this.toResponse(sheet, children);
  }

  /** Starts the GLB build for a finished sheet and holds the build price. */
  async startBuild(
    actor: Models3dActor,
    id: string,
  ): Promise<Models3dResponse> {
    const sheet = await this.loadSheet(actor, id);
    const children = await this.loadChildren(actor, id);
    const status = this.deriveStatus(sheet, children);
    if (status !== 'sheet_ready' && status !== 'failed') {
      throw new ConflictException(
        status === 'sheet_pending'
          ? 'The angle sheet is not ready yet'
          : `The render is already ${status}`,
      );
    }
    if (sheet.status !== IngredientStatus.GENERATED) {
      throw new ConflictException('The angle sheet did not render');
    }

    const credits = await this.billing.quoteStep('build', actor.organizationId);
    await this.createFundedChild(actor, id, credits);
    await this.build.startBuild(id);
    return this.get(actor, id);
  }

  /** Signed URL of the finished GLB. */
  async getFileUrl(actor: Models3dActor, id: string): Promise<string> {
    const sheet = await this.loadSheet(actor, id);
    const children = await this.loadChildren(actor, id);
    const child = this.latest(children);
    if (this.deriveStatus(sheet, children) !== 'ready' || !child) {
      throw new ConflictException('The 3D model is not ready');
    }
    return this.glbUrl(child);
  }

  /**
   * Creates the GLB child of a sheet and holds the build price against it.
   * Rolls the child back when the balance is short.
   */
  private async createFundedChild(
    actor: Models3dActor,
    sheetId: string,
    credits: number,
  ): Promise<string> {
    const child = await this.shared.createMediaDocumentsInternal({
      brandId: actor.brandId ?? '',
      category: IngredientCategory.MODEL_3D,
      extension: MetadataExtension.GLB,
      generationSource: 'models3d:build',
      model: MODELS3D_BUILD_MODEL_KEY,
      organizationId: actor.organizationId,
      origin: IngredientOrigin.GENERATED,
      parentId: sheetId,
      providerData: this.providerData({ credits }),
      sourceIds: [sheetId],
      status: IngredientStatus.PROCESSING,
      userId: actor.userId,
    });
    const childId = child.ingredientData.id.toString();
    try {
      await this.billing.hold({
        brandId: actor.brandId,
        credits,
        ingredientId: childId,
        organizationId: actor.organizationId,
        step: 'build',
        userId: actor.userId,
      });
    } catch (error: unknown) {
      await this.discard(actor, [childId]);
      throw error;
    }
    return childId;
  }

  /** Removes rows of a render that never started and refunds their holds. */
  private async discard(
    actor: Models3dActor,
    ids: Array<string | undefined>,
  ): Promise<void> {
    for (const id of ids) {
      if (!id) continue;
      await this.billing.release(id, actor.organizationId);
      try {
        await this.ingredients.patch(id, { isDeleted: true });
      } catch (error: unknown) {
        this.loggerService.error(`${this.logContext} discard failed`, error, {
          id,
        });
      }
    }
  }

  private providerData(
    data: Models3dProviderData['models3d'],
  ): Record<string, unknown> {
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    return { models3d: clean };
  }

  private async loadSheet(actor: Models3dActor, id: string): Promise<SheetRow> {
    let sheet: SheetRow | null = null;
    try {
      sheet = await this.ingredients.findOne({
        category: IngredientCategory.IMAGE,
        id,
        isDeleted: false,
        organizationId: actor.organizationId,
      });
    } catch {
      sheet = null;
    }
    const data = sheet?.providerData as Partial<Models3dProviderData> | null;
    if (!sheet || !data?.models3d) {
      throw new NotFoundException('3D render');
    }
    return sheet;
  }

  private loadChildren(actor: Models3dActor, id: string) {
    return this.ingredients.find({
      category: IngredientCategory.MODEL_3D,
      isDeleted: false,
      organizationId: actor.organizationId,
      parentId: id,
    });
  }

  private latest(children: SheetRow[]): SheetRow | undefined {
    return [...children].sort(
      (a, b) =>
        new Date(b.createdAt as Date).getTime() -
        new Date(a.createdAt as Date).getTime(),
    )[0];
  }

  /** The sheet is checked first: a failed sheet fails the whole render. */
  private deriveStatus(sheet: SheetRow, children: SheetRow[]): Models3dStatus {
    if (sheet.status === IngredientStatus.PROCESSING) return 'sheet_pending';
    if (sheet.status === IngredientStatus.FAILED) return 'failed';
    const child = this.latest(children);
    if (!child) return 'sheet_ready';
    if (child.status === IngredientStatus.PROCESSING) return 'building';
    if (child.status === IngredientStatus.FAILED) return 'failed';
    return 'ready';
  }

  private async toResponse(
    sheet: SheetRow,
    children: SheetRow[],
  ): Promise<Models3dResponse> {
    const status = this.deriveStatus(sheet, children);
    const child = this.latest(children);
    const sheetData = (sheet.providerData as Partial<Models3dProviderData>)
      .models3d;
    const childData = (
      child?.providerData as Partial<Models3dProviderData> | null | undefined
    )?.models3d;

    const response: Models3dResponse = {
      credits: {
        build: childData?.credits ?? null,
        sheet: sheetData?.credits ?? 0,
      },
      id: sheet.id.toString(),
      status,
    };
    if (status === 'failed') {
      const failed =
        sheet.status === IngredientStatus.FAILED ? sheet : (child ?? sheet);
      response.error = failed.generationError ?? 'The 3D render failed';
    }
    if (sheet.status === IngredientStatus.GENERATED && sheet.s3Key) {
      response.sheetUrl =
        await this.filesClient.getPresignedDownloadUrlForObjectKey(sheet.s3Key);
    }
    if (child) response.modelIngredientId = child.id.toString();
    if (status === 'ready' && child) {
      response.glbUrl = await this.glbUrl(child);
    }
    return response;
  }

  private async glbUrl(child: SheetRow): Promise<string> {
    if (child.s3Key) {
      return this.filesClient.getPresignedDownloadUrlForObjectKey(child.s3Key);
    }
    return this.filesClient.getPresignedDownloadUrl(
      child.id.toString(),
      'model_3ds',
    );
  }
}
