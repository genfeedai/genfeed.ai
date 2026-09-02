import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import type { UpdateTrainingDto } from '@api/collections/trainings/dto/update-training.dto';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  requireRelationId,
  resolveEntityId,
} from '@api/shared/utils/relation-id/relation-id.util';
import {
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as archiver from 'archiver';

type ZipArchiveConstructor = new (options: {
  zlib: { level: number };
}) => archiver.Archiver;

// archiver@8 exports ZipArchive at runtime; some bundled type surfaces omit it.
const { ZipArchive } = archiver as typeof archiver & {
  ZipArchive: ZipArchiveConstructor;
};

export interface TrainingSourceImage {
  id: string;
  metadata: {
    extension?: string;
  };
}

interface TrainingOwnerMetadata {
  brandId?: string | null;
  organizationId?: string;
  userId?: string;
}

@Injectable()
export class TrainingsService extends BaseService<
  TrainingDocument,
  CreateTrainingDto,
  UpdateTrainingDto
> {
  private readonly constructorName = this.constructor.name;

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly filesClientService: FilesClientService,
    private readonly fileQueueService: FileQueueService,
    private readonly ingredientsService: IngredientsService,
    private readonly modelsService: ModelsService,
    private readonly replicateService: ReplicateService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly memoryMonitorService: MemoryMonitorService,
  ) {
    super(prisma, 'training', logger);
  }

  override create(
    createInput: CreateTrainingDto | Record<string, unknown>,
  ): Promise<TrainingDocument> {
    const input = createInput as CreateTrainingDto & Record<string, unknown>;
    const config =
      input.config &&
      typeof input.config === 'object' &&
      !Array.isArray(input.config)
        ? { ...(input.config as Record<string, unknown>) }
        : {};
    const configFields = [
      'baseModel',
      'category',
      'learningRate',
      'loraName',
      'loraRank',
      'model',
      'personaSlug',
      'progress',
      'provider',
      'seed',
      'status',
      'steps',
      'trigger',
    ] as const;

    for (const field of configFields) {
      if (input[field] !== undefined) {
        config[field] = input[field];
      }
    }

    const sourceIds = Array.isArray(input.sources)
      ? input.sources.filter(
          (sourceId): sourceId is string => typeof sourceId === 'string',
        )
      : [];

    return super.create({
      brandId: input.brandId,
      config,
      description: input.description,
      externalId: input.externalId,
      isDeleted: input.isDeleted,
      label: input.label,
      organizationId: input.organizationId,
      personaId: input.personaId,
      ...(sourceIds.length > 0
        ? { sources: { connect: sourceIds.map((id) => ({ id })) } }
        : input.sources && !Array.isArray(input.sources)
          ? { sources: input.sources }
          : {}),
      stage: input.stage,
      userId: input.userId,
    } as unknown as CreateTrainingDto);
  }

  /**
   * Resolve+validate source images, create the training record, and bind the
   * source images to it via a single bounded bulk update.
   *
   * Extracted from `TrainingsController.create` (#2049 follow-up) to keep the
   * controller thin and the file under the runtime-complexity line budget.
   */
  async createTrainingWithSources(
    createDto: CreateTrainingDto,
    identity: TrainingOwnerMetadata,
  ): Promise<{
    sourceImages: TrainingSourceImage[];
    training: TrainingDocument;
  }> {
    const ownerIds = {
      brandId: resolveEntityId(identity.brandId) ?? null,
      organizationId: requireRelationId(
        identity.organizationId,
        'organizationId',
        'Training owner',
      ),
      userId: requireRelationId(identity.userId, 'userId', 'Training owner'),
    };
    const sources = createDto.sources || [];

    if (sources.length < 10) {
      throw new HttpException(
        {
          detail: 'At least 10 sources are required for training',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const sourceResult = await this.ingredientsService.findAll(
      {
        where: {
          // Keep the source restriction and ownership restriction under
          // separate `AND` branches so neither predicate overwrites the other.
          AND: [
            { id: { in: sources } },
            {
              OR: [
                { userId: ownerIds.userId },
                { organizationId: ownerIds.organizationId },
              ],
            },
          ],
          category: CategoryPrismaUtil.toIngredientCategory(
            IngredientCategory.IMAGE,
          ),
        },
      },
      {
        pagination: false,
      },
    );

    const sourceImages = (
      (sourceResult.docs as TrainingSourceImage[]) ?? []
    ).map((image) => ({
      id: image.id,
      metadata: image.metadata ?? {},
    }));

    if (sourceImages.length < 10) {
      throw new HttpException(
        {
          detail: 'Could not find all specified sources',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let resolvedModel: string | undefined = createDto.model;
    if (!resolvedModel) {
      try {
        const defaultTrainer = await this.modelsService.findOne({
          isDefault: true,
          key: { contains: `^${MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER}` },
          provider: 'replicate',
        });
        resolvedModel = defaultTrainer?.key;
      } catch (error: unknown) {
        this.logger.error('Failed to find default trainer model', error);
      }
    }

    const training = await this.create({
      brandId: ownerIds.brandId,
      config: {
        category: createDto.category || 'subject',
        model:
          resolvedModel || this.configService.get('REPLICATE_MODELS_TRAINER'),
        provider: createDto.provider || 'replicate',
        seed: createDto.seed ? Number(createDto.seed) : -1,
        status: IngredientStatus.PROCESSING,
        steps: createDto.steps ? Number(createDto.steps) : 1000,
        trigger: createDto.trigger || 'TOK',
      },
      description: createDto.description || '',
      label: createDto.label || 'Custom Model',
      organizationId: ownerIds.organizationId,
      sources: {
        connect: sourceImages.map((img) => ({ id: img.id })),
      },
      userId: ownerIds.userId,
    } as unknown as Parameters<TrainingsService['create']>[0]);

    if (!training) {
      throw new HttpException(
        {
          detail: 'Failed to create training',
          title: 'Failed to create training',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Every source image receives the identical payload, so this collapses to
    // a single tenant-scoped `updateMany` instead of N concurrent UPDATEs.
    // `trainingId` is the scalar FK — the legacy `training` relation alias is
    // not remapped by `normalizeData` and would reach Prisma unresolved.
    await this.ingredientsService.patchAll(
      {
        id: { in: sourceImages.map((img) => img.id) },
        OR: [
          { userId: ownerIds.userId },
          { organizationId: ownerIds.organizationId },
        ],
      },
      {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.SOURCE,
        ),
        trainingId: training.id as string,
      },
    );

    return { sourceImages, training };
  }

  /**
   * Resolve+validate source images for a relaunch, create the new training
   * record from the existing config, and bind the source images to it via a
   * single bounded bulk update.
   *
   * Extracted from `TrainingsOperationsController.relaunchTraining` (#2049
   * follow-up) to keep the controller under the runtime-complexity budget.
   */
  async relaunchTrainingWithSources(
    existingTraining: TrainingDocument,
    identity: TrainingOwnerMetadata,
  ): Promise<{
    sourceImages: TrainingSourceImage[];
    training: TrainingDocument;
  }> {
    const ownerIds = {
      brandId: resolveEntityId(identity.brandId) ?? null,
      organizationId: requireRelationId(
        identity.organizationId,
        'organizationId',
        'Training owner',
      ),
      userId: requireRelationId(identity.userId, 'userId', 'Training owner'),
    };
    const sourceIds = Array.isArray(existingTraining.sources)
      ? existingTraining.sources.flatMap((source) => {
          const sourceId = resolveEntityId(source);
          return sourceId ? [sourceId] : [];
        })
      : [];

    let sourceImages: TrainingSourceImage[] = [];
    if (sourceIds.length > 0) {
      const sourceResult = await this.ingredientsService.findAll(
        {
          where: {
            id: {
              in: sourceIds,
            },
            category: CategoryPrismaUtil.toIngredientCategory(
              IngredientCategory.SOURCE,
            ),
            userId: ownerIds.userId,
          },
        },
        {
          pagination: false,
        },
        false,
      );

      sourceImages = ((sourceResult.docs as TrainingSourceImage[]) ?? []).map(
        (image) => ({
          id: image.id,
          metadata: image.metadata ?? {},
        }),
      );
    }

    if (sourceImages.length < 10) {
      throw new HttpException(
        {
          detail: 'Could not find all source images for relaunching training',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Training config (category/model/provider/seed/steps/trigger) lives in
    // the nested `config` JSON column on the Prisma model, not as top-level
    // fields. Read from there so the relaunch preserves the original setup.
    const existingConfig = (existingTraining.config ?? {}) as Record<
      string,
      unknown
    >;

    const newTraining = await this.create({
      brandId: existingTraining.brandId ?? ownerIds.brandId,
      config: {
        category: (existingConfig.category as string | undefined) || 'subject',
        model:
          (existingConfig.model as string | undefined) ||
          this.configService.get('REPLICATE_MODELS_TRAINER'),
        provider:
          (existingConfig.provider as string | undefined) || 'replicate',
        seed:
          typeof existingConfig.seed === 'number' ? existingConfig.seed : -1,
        status: IngredientStatus.PROCESSING,
        steps:
          typeof existingConfig.steps === 'number'
            ? existingConfig.steps
            : 1000,
        trigger: (existingConfig.trigger as string | undefined) || 'TOK',
      },
      description: existingTraining.description || '',
      label: existingTraining.label || 'Custom Model',
      organizationId: ownerIds.organizationId,
      sources: {
        connect: sourceImages.map((img) => ({ id: img.id })),
      },
      userId: ownerIds.userId,
    } as unknown as Parameters<TrainingsService['create']>[0]);

    if (!newTraining) {
      throw new HttpException(
        {
          detail: 'Failed to create new training',
          title: 'Failed to create new training',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Identical payload for every source image, so this collapses to a single
    // owner-scoped `updateMany` instead of N concurrent UPDATEs. `trainingId`
    // is the scalar FK — the legacy `training` relation alias is not remapped
    // by `normalizeData` and would reach Prisma unresolved.
    await this.ingredientsService.patchAll(
      {
        id: { in: sourceImages.map((img) => img.id) },
        userId: ownerIds.userId,
      },
      {
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.SOURCE,
        ),
        trainingId: newTraining.id as string,
      },
    );

    return { sourceImages, training: newTraining };
  }

  /**
   * Create training zip file from source images
   */
  async createTrainingZip(
    trainingId: string,
    sourceImages: { id: string; metadata: { extension: string } }[],
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { imageCount: sourceImages.length, trainingId });

    // Monitor memory before starting
    this.memoryMonitorService.checkMemory();

    const zipFileName = `${trainingId}.zip`;
    const tmpDir = path.join(
      process.cwd(),
      'public',
      'tmp',
      'trainings',
      trainingId,
    );
    // Ensure directory exists
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const zipPath = path.join(tmpDir, zipFileName);

    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({
      zlib: { level: 9 },
    });

    archive.pipe(output);

    // Track successful downloads
    let successfulDownloads = 0;
    const supportedFormats = ['jpg', 'jpeg', 'png', 'webp'];

    // Filter to only required fields and download via FilesService
    for (let i = 0; i < sourceImages.length; i++) {
      const img = sourceImages[i];
      const id = img.id;
      const extension = String(img.metadata?.extension || 'jpg').toLowerCase();

      if (!id) {
        continue;
      }

      try {
        if (!supportedFormats.includes(extension)) {
          this.logger.warn(
            `Skipping image ${i} with unsupported format: ${extension}`,
          );
          continue;
        }

        // Queue download file operation in files.genfeed service
        const downloadJob = await this.fileQueueService.processFile({
          ingredientId: trainingId,
          organizationId: 'system',
          params: {
            index: i,
            type: 'trainings',
            url: `${this.configService.ingredientsEndpoint}/images/${id}`,
          },
          type: 'download-file',
          userId: 'system',
        });
        const result = await this.fileQueueService.waitForJob(
          downloadJob.jobId,
          30_000,
        );

        // Use the returned file path from the download job
        const filePath =
          typeof result?.outputPath === 'string'
            ? result.outputPath
            : undefined;
        if (!filePath) {
          this.logger.warn(`No output path returned for image ${i}`);
          continue;
        }

        // Check if file exists and has content
        if (!fs.existsSync(filePath)) {
          this.logger.warn(`Skipping missing image ${i} at ${filePath}`);
          continue;
        }

        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          this.logger.warn(`Skipping empty image ${i}`);
          continue;
        }

        // Stream the file directly to archive instead of loading into memory
        archive.append(fs.createReadStream(filePath), {
          name: `training/image_${successfulDownloads + 1}.jpeg`,
        });

        successfulDownloads++;

        // Monitor memory every 10 images
        if (successfulDownloads % 10 === 0) {
          this.memoryMonitorService.checkMemory();
        }
      } catch (error: unknown) {
        this.logger.error(`Failed to process training image ${i}`, error);
      }
    }

    // Ensure we have minimum required images
    if (successfulDownloads < 10) {
      throw new Error(
        `Failed to download minimum required images. Got ${successfulDownloads}, need at least 10`,
      );
    }

    // Finalize the archive
    await new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', reject);
      void archive.finalize();
    });

    // Upload zip to S3 under trainings/<trainingId>
    const s3Key = `${trainingId}/${zipFileName}`;
    await this.filesClientService.uploadToS3(s3Key, 'trainings', {
      path: zipPath,
      type: FileInputType.FILE,
    });

    const uploadedUrl = `${this.configService.ingredientsEndpoint}/trainings/${s3Key}`;

    // Clean up temp file
    fs.unlinkSync(zipPath);

    return uploadedUrl;
  }

  /**
   * Launch training on Replicate
   */
  async launchTraining(
    training: unknown,
    uploadedUrl: string,
  ): Promise<string> {
    const launchConfig = this.normalizeLaunchTraining(training);

    // Derive destination from training id to avoid persisting user-provided values
    const destination: `${string}/${string}` = `${this.configService.get('REPLICATE_OWNER')}/${launchConfig.id}`;

    const externalId = await this.replicateService.runTraining(
      destination,
      {
        input_images: uploadedUrl,
        lora_type: launchConfig.type,
        seed: launchConfig.seed,
        training_steps: launchConfig.steps,
        trigger_word: launchConfig.trigger,
      },

      this.configService.get('REPLICATE_MODELS_TRAINER'),
    );

    // Update training with external training ID
    await this.patch(launchConfig.id, {
      externalId,
    });

    // Emit websocket event for training processing
    await this.websocketService.publishTrainingStatus(
      launchConfig.id,
      IngredientStatus.PROCESSING,
      launchConfig.user,
      { externalId, training },
    );

    return externalId;
  }

  private normalizeLaunchTraining(training: unknown): {
    id: string;
    seed?: number;
    steps: number;
    trigger: string;
    type?: string;
    user: string;
  } {
    const trainingRecord = this.readObjectRecord(training);
    if (!trainingRecord) {
      throw new Error('Training payload is invalid');
    }

    const trainingId = this.readString(trainingRecord.id);
    if (!trainingId) {
      throw new Error('Training id is missing');
    }

    return {
      id: trainingId,
      seed: this.readNumber(this.readTrainingField(trainingRecord, 'seed')),
      steps:
        this.readNumber(this.readTrainingField(trainingRecord, 'steps')) ??
        1000,
      trigger:
        this.readString(this.readTrainingField(trainingRecord, 'trigger')) ??
        'TOK',
      type: this.readString(this.readTrainingField(trainingRecord, 'type')),
      user: this.readString(trainingRecord.userId) ?? 'unknown',
    };
  }

  private readTrainingField(
    training: Record<string, unknown>,
    field: string,
  ): unknown {
    if (field in training) {
      return training[field];
    }

    return this.readObjectRecord(training.config)?.[field];
  }

  private readNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return undefined;
  }

  private readObjectRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  /**
   * Count an organization's trainings. Encapsulates the raw Prisma aggregation
   * so fleet callers don't reach into `.prisma.*`.
   */
  async countTrainingsByOrganization(organizationId: string): Promise<number> {
    return this.prisma.training.count({
      where: scopedWhere(organizationId, {}),
    });
  }

  /**
   * Group an organization's trainings by stage.
   */
  async groupTrainingsByStage(
    organizationId: string,
  ): Promise<Array<{ stage: string | null; count: number }>> {
    const groups = await this.prisma.training.groupBy({
      _count: { id: true },
      by: ['stage'],
      where: scopedWhere(organizationId, {}),
    });

    return groups.map((group) => ({
      count: group._count.id,
      stage: group.stage,
    }));
  }
}
