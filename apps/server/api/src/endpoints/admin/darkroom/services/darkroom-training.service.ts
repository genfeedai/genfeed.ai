import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import { TrainingsService } from '@api/collections/trainings/services/trainings.service';
import { ConfigService } from '@api/config/config.service';
import { LoraStatus, TrainingStage, TrainingStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import axios from 'axios';

interface TrainingHyperparams {
  steps: number;
  rank: number;
  captionDropout: number;
  learningRate: number;
  batchSize: number;
}

interface TrainingqueryParams {
  trainingId: string;
  organizationId: string;
  personaSlug: string;
  triggerWord: string;
  loraName: string;
  steps: number;
  loraRank: number;
  learningRate: number;
  baseModel: string;
}

/** NestJS images service: GET /datasets/:slug */
interface ImagesDatasetResponse {
  slug: string;
  imageCount: number;
  images: string[];
  path: string;
}

/** NestJS images service: POST /train */
interface ImagesTrainResponse {
  jobId: string;
}

/** NestJS images service: GET /train/:jobId */
interface ImagesJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  progress: number;
  error?: string;
}

/** NestJS images service: POST /loras/upload */
interface ImagesLoraUploadResponse {
  loraName: string;
  s3Key: string;
  uploaded: boolean;
}

@Injectable()
export class DarkroomTrainingService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly imagesApiUrl: string;

  constructor(
    private readonly trainingsService: TrainingsService,
    private readonly personasService: PersonasService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly modelRegistrationService: ModelRegistrationService,
  ) {
    this.imagesApiUrl = this.configService.get('GPU_IMAGES_URL') ?? '';
  }

  /**
   * Auto-tune hyperparameters based on dataset size.
   * Ported from others/darkroom/dashboard/scripts/generate-training-config.py
   */
  autoTuneHyperparameters(imageCount: number): TrainingHyperparams {
    if (imageCount < 10) {
      return {
        batchSize: 1,
        captionDropout: 0.1,
        learningRate: 4e-4,
        rank: 16,
        steps: 1000,
      };
    } else if (imageCount < 15) {
      return {
        batchSize: 1,
        captionDropout: 0.08,
        learningRate: 4e-4,
        rank: 24,
        steps: 1500,
      };
    } else if (imageCount < 25) {
      return {
        batchSize: 1,
        captionDropout: 0.05,
        learningRate: 4e-4,
        rank: 32,
        steps: 2000,
      };
    }

    return {
      batchSize: 1,
      captionDropout: 0.03,
      learningRate: 4e-4,
      rank: 32,
      steps: 3000,
    };
  }

  /**
   * Update training stage and progress in DB
   */
  async updateStage(
    trainingId: string,
    stage: TrainingStage,
    progress: number,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { progress, stage, trainingId });

    const update: Record<string, unknown> = { progress, stage };

    if (stage === TrainingStage.TRAINING) {
      update.startedAt = new Date();
      update.status = TrainingStatus.PROCESSING;
    }
    if (stage === TrainingStage.COMPLETED || stage === TrainingStage.FAILED) {
      update.completedAt = new Date();
      update.status =
        stage === TrainingStage.COMPLETED
          ? TrainingStatus.COMPLETED
          : TrainingStatus.FAILED;
    }

    if (extra) {
      Object.assign(update, extra);
    }

    await this.trainingsService.patch(trainingId, update);
  }

  /**
   * Execute the full training pipeline (fire-and-forget).
   * Calls NestJS images service HTTP endpoints.
   */
  async executeTrainingquery(params: TrainingqueryParams): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      loraName: params.loraName,
      personaSlug: params.personaSlug,
      trainingId: params.trainingId,
    });

    try {
      // Stage: PREPROCESSING — verify dataset on GPU via HTTP
      await this.updateStage(
        params.trainingId,
        TrainingStage.PREPROCESSING,
        10,
      );

      const { data: dataset } = await axios.get<ImagesDatasetResponse>(
        `${this.imagesApiUrl}/datasets/${params.personaSlug}`,
        { timeout: 15000 },
      );

      if (dataset.imageCount === 0) {
        throw new Error(
          `No training images found for ${params.personaSlug} on GPU`,
        );
      }

      this.loggerService.log(caller, {
        imageCount: dataset.imageCount,
        message: 'Dataset verified via NestJS images service',
      });

      await this.updateStage(
        params.trainingId,
        TrainingStage.PREPROCESSING,
        30,
      );

      // Stage: TRAINING — start training via NestJS images service
      await this.updateStage(params.trainingId, TrainingStage.TRAINING, 30);

      const { data: trainResult } = await axios.post<ImagesTrainResponse>(
        `${this.imagesApiUrl}/train`,
        {
          learningRate: params.learningRate,
          loraName: params.loraName,
          loraRank: params.loraRank,
          personaSlug: params.personaSlug,
          steps: params.steps,
          triggerWord: params.triggerWord,
        },
        { timeout: 30000 },
      );

      this.loggerService.log(caller, {
        jobId: trainResult.jobId,
        message: 'Training job started',
      });

      // Poll job status until completion
      await this.pollTrainingJob(
        params.trainingId,
        trainResult.jobId,
        params.loraName,
        params.personaSlug,
        params.organizationId,
      );
    } catch (error) {
      await this.updatePersonaLoraState(
        params.personaSlug,
        params.organizationId,
        LoraStatus.FAILED,
      );
      this.loggerService.error(caller, {
        error: error instanceof Error ? error.message : String(error),
        trainingId: params.trainingId,
      });

      await this.updateStage(params.trainingId, TrainingStage.FAILED, 0, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Poll NestJS images service for training job status, updating DB progress.
   */
  private async pollTrainingJob(
    trainingId: string,
    gpuJobId: string,
    loraName: string,
    personaSlug: string,
    organizationId: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const pollIntervalMs = 15000;
    const maxPollAttempts = 720; // 3 hours max (720 * 15s)

    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const { data: job } = await axios.get<ImagesJobStatus>(
        `${this.imagesApiUrl}/train/${gpuJobId}`,
        { timeout: 15000 },
      );

      // Map GPU job stage to TrainingStage enum
      const stageMap: Record<string, TrainingStage> = {
        completed: TrainingStage.COMPLETED,
        failed: TrainingStage.FAILED,
        postprocessing: TrainingStage.POSTPROCESSING,
        training: TrainingStage.TRAINING,
        uploading: TrainingStage.UPLOADING,
      };

      const stage = stageMap[job.stage] ?? TrainingStage.TRAINING;
      await this.updateStage(trainingId, stage, job.progress);

      if (job.status === 'completed') {
        // Upload trained LoRA to S3 via images service
        await this.uploadLoraToS3(trainingId, loraName);
        await this.updatePersonaLoraState(
          personaSlug,
          organizationId,
          LoraStatus.READY,
          `${loraName}.safetensors`,
        );
        await this.updateStage(trainingId, TrainingStage.COMPLETED, 100, {
          loraName,
        });

        // Register trained model in the model registry
        try {
          const completedTraining = await this.trainingsService.findOne({
            _id: trainingId,
          });
          if (completedTraining) {
            await this.modelRegistrationService.createFromTraining(
              completedTraining,
            );
          }
        } catch (err) {
          // Non-fatal: reconciliation job will retry
          this.loggerService.error(caller, {
            error: err instanceof Error ? err.message : String(err),
            message: `Failed to register Darkroom model from training ${trainingId}`,
            trainingId,
          });
        }

        this.loggerService.log(caller, {
          gpuJobId,
          loraName,
          message: 'Training pipeline completed',
          trainingId,
        });
        return;
      }

      if (job.status === 'failed') {
        throw new Error(
          `GPU training job ${gpuJobId} failed: ${job.error ?? 'unknown error'}`,
        );
      }
    }

    throw new Error(
      `Training job ${gpuJobId} timed out after ${maxPollAttempts} poll attempts`,
    );
  }

  /**
   * Upload the trained .safetensors file to S3 via the NestJS images service.
   * The images service LoRA upload endpoint handles the actual S3 transfer.
   */
  private async uploadLoraToS3(
    trainingId: string,
    loraName: string,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await this.updateStage(trainingId, TrainingStage.UPLOADING, 90);

    this.loggerService.log(caller, {
      loraName,
      message: 'Uploading trained LoRA to S3 via images service',
      trainingId,
    });

    const { data: uploadResult } = await axios.post<ImagesLoraUploadResponse>(
      `${this.imagesApiUrl}/loras/upload`,
      {
        localPath: `/comfyui/models/loras/${loraName}.safetensors`,
        loraName,
      },
      { timeout: 120000 },
    );

    this.loggerService.log(caller, {
      loraName,
      message: 'LoRA uploaded to S3',
      s3Key: uploadResult.s3Key,
      trainingId,
      uploaded: uploadResult.uploaded,
    });
  }

  async getDatasetInfo(slug: string): Promise<ImagesDatasetResponse> {
    const { data } = await axios.get<ImagesDatasetResponse>(
      `${this.imagesApiUrl}/datasets/${slug}`,
      { timeout: 15000 },
    );
    return data;
  }

  async syncDataset(
    slug: string,
    s3Keys: string[],
    bucket?: string,
  ): Promise<void> {
    await axios.post(
      `${this.imagesApiUrl}/datasets/${slug}/sync`,
      { bucket, s3Keys },
      { timeout: 120000 },
    );
  }

  async updatePersonaLoraState(
    personaSlug: string,
    organizationId: string | undefined,
    loraStatus: LoraStatus,
    loraModelPath?: string,
  ): Promise<void> {
    const persona = await this.personasService.findOne({
      ...(organizationId ? { organization: organizationId } : {}),
      isDarkroomCharacter: true,
      isDeleted: false,
      slug: personaSlug,
    });

    if (!persona) {
      return;
    }

    await this.personasService.patch(persona._id.toString(), {
      loraModelPath,
      loraStatus,
    });
  }
}
