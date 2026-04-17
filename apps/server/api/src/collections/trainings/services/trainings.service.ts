import fs from 'node:fs';
import path from 'node:path';
import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';
import { UpdateTrainingDto } from '@api/collections/trainings/dto/update-training.dto';
import type { TrainingDocument } from '@api/collections/trainings/schemas/training.schema';
import { ConfigService } from '@api/config/config.service';
import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { FileInputType, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import archiver from 'archiver';

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
    private readonly replicateService: ReplicateService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly memoryMonitorService: MemoryMonitorService,
  ) {
    // TODO: remove model arg after BaseService Prisma migration
    super(undefined as never, logger);
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
    const archive = archiver('zip', {
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
        const filePath = result?.outputPath;
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
    // Derive destination from training id to avoid persisting user-provided values
    const destination: `${string}/${string}` = `${this.configService.get('REPLICATE_OWNER')}/${String(training._id)}`;

    const externalId = await this.replicateService.runTraining(
      destination,
      {
        input_images: uploadedUrl,
        lora_type: training.type,
        seed: training.seed || -1,
        training_steps: training.steps,
        trigger_word: training.trigger,
      },

      this.configService.get('REPLICATE_MODELS_TRAINER'),
    );

    // Update training with external training ID
    await this.patch(training._id, {
      externalId,
    });

    // Emit websocket event for training processing
    await this.websocketService.publishTrainingStatus(
      String(training._id),
      IngredientStatus.PROCESSING,
      training.user,
      { externalId, training },
    );

    return externalId;
  }
}
