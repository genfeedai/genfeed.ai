import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@voices/config/config.service';
import type {
  VoiceTrainingJob,
  VoiceTrainingJobSummary,
  VoiceTrainingParams,
  VoiceTrainingRequest,
} from '@voices/interfaces/voice-training.interfaces';

const DEFAULT_SAMPLE_RATE = 22050;
const DEFAULT_EPOCHS = 100;
const DEFAULT_BATCH_SIZE = 8;

@Injectable()
export class VoiceTrainingService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly jobs: Map<string, VoiceTrainingJob> = new Map();
  private readonly processes: Map<string, ChildProcess> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async startTraining(
    request: VoiceTrainingRequest,
  ): Promise<{ jobId: string; status: 'queued' }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!request.voiceId) {
      throw new BadRequestException('voiceId is required');
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();

    const params: VoiceTrainingParams = {
      batchSize: request.batchSize ?? DEFAULT_BATCH_SIZE,
      epochs: request.epochs ?? DEFAULT_EPOCHS,
      sampleRate: request.sampleRate ?? DEFAULT_SAMPLE_RATE,
      voiceId: request.voiceId,
    };

    const job: VoiceTrainingJob = {
      createdAt: now,
      jobId,
      params,
      progress: 0,
      stage: 'preprocessing',
      status: 'queued',
      updatedAt: now,
      voiceId: params.voiceId,
    };

    this.jobs.set(jobId, job);

    this.loggerService.log(caller, {
      jobId,
      message: 'Voice training job created',
      params,
    });

    this.executeTraining(jobId, params);

    return { jobId, status: 'queued' };
  }

  async getJob(jobId: string): Promise<VoiceTrainingJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException(`Voice training job "${jobId}" not found`);
    }

    this.loggerService.log(caller, {
      jobId,
      message: 'Voice training job status retrieved',
      stage: job.stage,
      status: job.status,
    });

    return job;
  }

  async listJobs(): Promise<VoiceTrainingJobSummary[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const summaries: VoiceTrainingJobSummary[] = [];

    for (const job of this.jobs.values()) {
      summaries.push({
        createdAt: job.createdAt,
        jobId: job.jobId,
        progress: job.progress,
        stage: job.stage,
        status: job.status,
        voiceId: job.voiceId,
      });
    }

    this.loggerService.log(caller, {
      count: summaries.length,
      message: 'Voice training jobs listed',
    });

    return summaries;
  }

  buildTrainingCommand(params: VoiceTrainingParams): {
    command: string;
    args: string[];
  } {
    const binaryPath = this.configService.VOICE_TRAINING_BINARY_PATH;
    const datasetsPath = this.configService.DATASETS_PATH;
    const modelsPath = this.configService.VOICE_MODELS_PATH;

    const datasetDir = `${datasetsPath}/voices/${params.voiceId}`;
    const outputDir = `${modelsPath}/${params.voiceId}`;

    const args: string[] = [
      '--dataset_path',
      datasetDir,
      '--output_path',
      outputDir,
      '--sample_rate',
      String(params.sampleRate),
      '--epochs',
      String(params.epochs),
      '--batch_size',
      String(params.batchSize),
    ];

    return { args, command: binaryPath };
  }

  private executeTraining(jobId: string, params: VoiceTrainingParams): void {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const { command, args } = this.buildTrainingCommand(params);

    this.loggerService.log(caller, {
      argCount: args.length,
      command,
      jobId,
      message: 'Spawning voice training process',
    });

    try {
      const child = spawn(command, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.processes.set(jobId, child);

      this.updateJob(jobId, {
        progress: 5,
        stage: 'training',
        status: 'running',
      });

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        this.loggerService.log(caller, {
          jobId,
          message: 'Voice training stdout',
          output: output.slice(0, 500),
        });

        const progressMatch = output.match(
          /epoch\s+(\d+)\/(\d+)|(\d+)\/(\d+)\s+\[/i,
        );
        if (progressMatch) {
          const current = Number(progressMatch[1] || progressMatch[3]);
          const total = Number(
            progressMatch[2] || progressMatch[4] || params.epochs,
          );
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
          message: 'Voice training stderr',
          output: output.slice(0, 500),
        });
      });

      child.on('close', (code: number | null) => {
        this.processes.delete(jobId);

        if (code === 0) {
          this.updateJob(jobId, {
            completedAt: new Date().toISOString(),
            progress: 100,
            stage: 'completed',
            status: 'completed',
          });
          this.loggerService.log(caller, {
            jobId,
            message: 'Voice training completed successfully',
          });
        } else {
          this.updateJob(jobId, {
            completedAt: new Date().toISOString(),
            error: `Training process exited with code ${code}`,
            stage: 'failed',
            status: 'failed',
          });
          this.loggerService.error(
            `Voice training failed for job ${jobId}`,
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
          `Voice training process error for job ${jobId}`,
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
        `Failed to spawn voice training process for job ${jobId}`,
        error instanceof Error ? error : new Error(errorMessage),
      );
    }
  }

  private updateJob(jobId: string, updates: Partial<VoiceTrainingJob>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      const updated: VoiceTrainingJob = {
        ...job,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.jobs.set(jobId, updated);
    }
  }
}
