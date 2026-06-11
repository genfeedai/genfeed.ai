import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { TrainingStateStore } from '@libs/jobs/training-state.store';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Optional,
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
export class VoiceTrainingService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly jobs: Map<string, VoiceTrainingJob> = new Map();
  private readonly processes: Map<string, ChildProcess> = new Map();
  private readonly trainingStateStore: TrainingStateStore<VoiceTrainingJob>;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    @Optional() private readonly redisService?: RedisService,
  ) {
    this.trainingStateStore = new TrainingStateStore<VoiceTrainingJob>(
      'voices',
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
      this.loggerService.warn(caller, {
        isAlive,
        jobId: record.jobId,
        message: 'Orphaned voice training process detected on startup',
        pid: record.pid,
        startedAt: record.startedAt,
      });
      await this.updateJob(record.jobId, {
        completedAt: new Date().toISOString(),
        error: `Process orphaned by service restart (pid ${record.pid}, ${isAlive ? 'still running' : 'no longer running'})`,
        stage: 'failed',
        status: 'failed',
      });
      await this.trainingStateStore.deleteProcessRecord(record.jobId);
    }
  }

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
    await this.trainingStateStore.persistJob(job);

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

    let job = this.jobs.get(jobId);
    if (!job) {
      const persisted = await this.trainingStateStore.loadJob(jobId);
      if (persisted) {
        this.jobs.set(jobId, persisted);
        job = persisted;
      }
    }

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
      if (typeof child.pid === 'number') {
        void this.trainingStateStore.persistProcessRecord({
          jobId,
          pid: child.pid,
          startedAt: new Date().toISOString(),
        });
      }

      void this.updateJob(jobId, {
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
            void this.updateJob(jobId, { progress });
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
        void this.trainingStateStore.deleteProcessRecord(jobId);

        if (code === 0) {
          void this.updateJob(jobId, {
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
          void this.updateJob(jobId, {
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
        void this.trainingStateStore.deleteProcessRecord(jobId);
        void this.updateJob(jobId, {
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
      void this.updateJob(jobId, {
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

  private async updateJob(
    jobId: string,
    updates: Partial<VoiceTrainingJob>,
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      const updated: VoiceTrainingJob = {
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
