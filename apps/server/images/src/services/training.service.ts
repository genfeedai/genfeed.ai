import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@images/config/config.service';
import type {
  TrainingJob,
  TrainingJobSummary,
  TrainingParams,
  TrainingRequest,
} from '@images/interfaces/training.interfaces';
import { S3Service } from '@images/services/s3.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

const DEFAULT_LORA_RANK = 16;
const DEFAULT_STEPS = 1500;
const DEFAULT_LEARNING_RATE = 1e-4;

@Injectable()
export class TrainingService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly jobs: Map<string, TrainingJob> = new Map();
  private readonly processes: Map<string, ChildProcess> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly s3Service: S3Service,
  ) {}

  async startTraining(request: TrainingRequest): Promise<{ jobId: string }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!request.personaSlug || !request.triggerWord || !request.loraName) {
      throw new BadRequestException(
        'personaSlug, triggerWord, and loraName are required',
      );
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();

    const params: TrainingParams = {
      learningRate: request.learningRate ?? DEFAULT_LEARNING_RATE,
      loraName: request.loraName,
      loraRank: request.loraRank ?? DEFAULT_LORA_RANK,
      personaSlug: request.personaSlug,
      steps: request.steps ?? DEFAULT_STEPS,
      triggerWord: request.triggerWord,
    };

    const job: TrainingJob = {
      createdAt: now,
      jobId,
      loraName: params.loraName,
      params,
      personaSlug: params.personaSlug,
      progress: 0,
      stage: 'preprocessing',
      status: 'running',
      triggerWord: params.triggerWord,
      updatedAt: now,
    };

    this.jobs.set(jobId, job);

    this.loggerService.log(caller, {
      jobId,
      message: 'Training job created',
      params,
    });

    this.executeTraining(jobId, params);

    return { jobId };
  }

  async getTrainingJob(jobId: string): Promise<TrainingJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException(`Training job "${jobId}" not found`);
    }

    this.loggerService.log(caller, {
      jobId,
      message: 'Training job status retrieved',
      stage: job.stage,
      status: job.status,
    });

    return job;
  }

  async listTrainingJobs(): Promise<TrainingJobSummary[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const summaries: TrainingJobSummary[] = [];

    for (const job of this.jobs.values()) {
      summaries.push({
        createdAt: job.createdAt,
        jobId: job.jobId,
        loraName: job.loraName,
        personaSlug: job.personaSlug,
        progress: job.progress,
        stage: job.stage,
        status: job.status,
      });
    }

    this.loggerService.log(caller, {
      count: summaries.length,
      message: 'Training jobs listed',
    });

    return summaries;
  }

  buildTrainingCommand(params: TrainingParams): {
    command: string;
    args: string[];
  } {
    const binaryPath = this.configService.TRAINING_BINARY_PATH;
    const datasetsPath = this.configService.DATASETS_PATH;
    const lorasPath = this.configService.COMFYUI_LORAS_PATH;

    const datasetDir = `${datasetsPath}/${params.personaSlug}`;

    const args: string[] = [
      '--pretrained_model_name_or_path',
      'stabilityai/stable-diffusion-xl-base-1.0',
      '--train_data_dir',
      datasetDir,
      '--output_dir',
      lorasPath,
      '--output_name',
      params.loraName,
      '--resolution',
      '1024',
      '--train_batch_size',
      '1',
      '--max_train_steps',
      String(params.steps),
      '--learning_rate',
      String(params.learningRate),
      '--network_module',
      'networks.lora',
      '--network_dim',
      String(params.loraRank),
      '--network_alpha',
      String(Math.floor(params.loraRank / 2)),
      '--caption_extension',
      '.txt',
      '--mixed_precision',
      'bf16',
      '--save_precision',
      'bf16',
      '--seed',
      '42',
      '--cache_latents',
      '--enable_bucket',
      '--lr_scheduler',
      'cosine',
    ];

    return { args, command: binaryPath };
  }

  private executeTraining(jobId: string, params: TrainingParams): void {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const { command, args } = this.buildTrainingCommand(params);

    this.loggerService.log(caller, {
      argCount: args.length,
      command,
      jobId,
      message: 'Spawning training process',
    });

    try {
      const child = spawn(command, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.processes.set(jobId, child);

      this.updateJob(jobId, { progress: 5, stage: 'training' });

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.loggerService.log(caller, {
          jobId,
          message: 'Training stdout',
          output: output.slice(0, 500),
        });

        const progressMatch = output.match(/(\d+)\/(\d+)\s+\[|step\s+(\d+)/i);
        if (progressMatch) {
          const current = Number(progressMatch[1] || progressMatch[3]);
          const total = Number(progressMatch[2] || params.steps);
          if (total > 0) {
            const progress = Math.min(95, Math.round((current / total) * 100));
            this.updateJob(jobId, { progress });
          }
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.loggerService.warn(caller, {
          jobId,
          message: 'Training stderr',
          output: output.slice(0, 500),
        });
      });

      child.on('close', (code: number | null) => {
        this.processes.delete(jobId);

        if (code === 0) {
          this.handleTrainingComplete(jobId, params).catch((error: unknown) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.updateJob(jobId, {
              completedAt: new Date().toISOString(),
              error: errorMessage,
              stage: 'failed',
              status: 'failed',
            });
            this.loggerService.error(
              `Post-training S3 upload failed for job ${jobId}`,
              error instanceof Error ? error : new Error(errorMessage),
            );
            this.updateJob(jobId, {
              completedAt: new Date().toISOString(),
              error: `Post-training upload failed: ${error instanceof Error ? error.message : String(error)}`,
              stage: 'failed',
              status: 'failed',
            });
          });
        } else {
          this.updateJob(jobId, {
            completedAt: new Date().toISOString(),
            error: `Training process exited with code ${code}`,
            stage: 'failed',
            status: 'failed',
          });
          this.loggerService.error(
            `Training failed for job ${jobId}`,
            new Error(`Exit code: ${code}`),
          );
        }
      });

      child.on('error', (error: Error) => {
        this.processes.delete(jobId);
        this.updateJob(jobId, {
          completedAt: new Date().toISOString(),
          error: error.message,
          stage: 'failed',
          status: 'failed',
        });
        this.loggerService.error(
          `Training process error for job ${jobId}`,
          error,
        );
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.updateJob(jobId, {
        completedAt: new Date().toISOString(),
        error: errorMessage,
        stage: 'failed',
        status: 'failed',
      });
      this.loggerService.error(
        `Failed to spawn training process for job ${jobId}`,
        error instanceof Error ? error : new Error(errorMessage),
      );
    }
  }

  /**
   * Handle post-training: upload .safetensors to S3 and mark job completed.
   */
  private async handleTrainingComplete(
    jobId: string,
    params: TrainingParams,
  ): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const lorasPath = this.configService.COMFYUI_LORAS_PATH;
    const localPath = `${lorasPath}/${params.loraName}.safetensors`;

    this.updateJob(jobId, { progress: 96, stage: 'uploading' });

    this.loggerService.log(caller, {
      jobId,
      localPath,
      loraName: params.loraName,
      message: 'Uploading trained LoRA to S3',
    });

    const bucket = this.configService.AWS_S3_BUCKET;

    if (bucket) {
      const { s3Key, sizeBytes } = await this.s3Service.uploadSafetensors(
        bucket,
        params.loraName,
        localPath,
      );

      this.loggerService.log(caller, {
        jobId,
        loraName: params.loraName,
        message: 'LoRA uploaded to S3',
        s3Key,
        sizeBytes,
      });
    } else {
      this.loggerService.warn(caller, {
        jobId,
        message: 'AWS_S3_BUCKET not configured, skipping S3 upload',
      });
    }

    this.updateJob(jobId, {
      completedAt: new Date().toISOString(),
      progress: 100,
      stage: 'completed',
      status: 'completed',
    });

    this.loggerService.log(caller, {
      jobId,
      message: 'Training completed successfully',
    });
  }

  private updateJob(jobId: string, updates: Partial<TrainingJob>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      const updated: TrainingJob = {
        ...job,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.jobs.set(jobId, updated);
    }
  }
}
