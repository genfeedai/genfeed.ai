import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { ConfigService } from '@images/config/config.service';
import type {
  TrainingJob,
  TrainingJobSummary,
  TrainingParams,
  TrainingRequest,
} from '@images/interfaces/training.interfaces';
import { TrainingStateStore } from '@libs/jobs/training-state.store';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RedisService } from '@libs/redis/redis.service';
import { S3Service } from '@libs/s3/s3.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';

const DEFAULT_LORA_RANK = 16;
const DEFAULT_STEPS = 1500;
const DEFAULT_LEARNING_RATE = 1e-4;

@Injectable()
export class TrainingService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly jobs: Map<string, TrainingJob> = new Map();
  private readonly processes: Map<string, ChildProcess> = new Map();
  private readonly trainingStateStore: TrainingStateStore<TrainingJob>;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly s3Service: S3Service,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.trainingStateStore = new TrainingStateStore<TrainingJob>(
      'images',
      loggerService,
      redisService,
    );
  }

  async onModuleInit(): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const [jobs, records] = await Promise.all([
      this.trainingStateStore.loadJobs(),
      this.trainingStateStore.loadProcessRecords(),
    ]);

    for (const job of jobs) {
      if (!this.jobs.has(job.jobId)) {
        this.jobs.set(job.jobId, job);
      }
    }

    for (const record of records) {
      const isAlive = this.isProcessAlive(record.pid);
      const job = this.jobs.get(record.jobId);
      const isTerminal =
        job?.status === 'completed' || job?.status === 'failed';

      this.loggerService.warn(caller, {
        isAlive,
        isTerminal,
        jobId: record.jobId,
        message: 'Orphaned training process detected on startup',
        pid: record.pid,
        startedAt: record.startedAt,
      });

      if (isTerminal) {
        // Job already reached a terminal state — do not overwrite; just clean up the stale record.
        await this.trainingStateStore.deleteProcessRecord(record.jobId);
      } else if (isAlive) {
        // Process is still running — leave it in its current state; do not mark failed.
        // The process record remains so a future restart can re-evaluate.
      } else {
        // Process is gone and the job is not yet terminal — mark it failed.
        await this.updateJob(record.jobId, {
          completedAt: new Date().toISOString(),
          error: `Process orphaned by service restart (pid ${record.pid}, no longer running)`,
          stage: 'failed',
          status: 'failed',
        });
        await this.trainingStateStore.deleteProcessRecord(record.jobId);
      }
    }
  }

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
    await this.trainingStateStore.persistJob(job);

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

    let job = this.jobs.get(jobId);
    if (!job) {
      const persisted = await this.trainingStateStore.loadJob(jobId);
      if (persisted) {
        this.jobs.set(jobId, persisted);
        job = persisted;
      }
    }

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
      if (typeof child.pid === 'number') {
        void this.trainingStateStore.persistProcessRecord({
          jobId,
          pid: child.pid,
          startedAt: new Date().toISOString(),
        });
      }

      void this.updateJob(jobId, { progress: 5, stage: 'training' });

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
            void this.updateJob(jobId, { progress });
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
        void this.trainingStateStore.deleteProcessRecord(jobId);

        if (code === 0) {
          this.handleTrainingComplete(jobId, params).catch((error: unknown) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            this.loggerService.error(
              `Post-training S3 upload failed for job ${jobId}`,
              error instanceof Error ? error : new Error(errorMessage),
            );
            void this.updateJob(jobId, {
              completedAt: new Date().toISOString(),
              error: `Post-training upload failed: ${errorMessage}`,
              stage: 'failed',
              status: 'failed',
            });
          });
        } else {
          void this.updateJob(jobId, {
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
        void this.trainingStateStore.deleteProcessRecord(jobId);
        void this.updateJob(jobId, {
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
      void this.updateJob(jobId, {
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

    await this.updateJob(jobId, { progress: 96, stage: 'uploading' });

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

    await this.updateJob(jobId, {
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

  private async updateJob(
    jobId: string,
    updates: Partial<TrainingJob>,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      const updated: TrainingJob = {
        ...job,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.jobs.set(jobId, updated);
      await this.trainingStateStore.persistJob(updated);
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}
