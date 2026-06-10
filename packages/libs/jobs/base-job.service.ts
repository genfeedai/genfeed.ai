import { randomUUID } from 'node:crypto';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/** Minimum required fields for any job tracked by BaseJobService. */
export interface BaseJob {
  jobId: string;
  type: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  params: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export type JobStats = {
  active: number;
  queued: number;
  completed: number;
  failed: number;
  total: number;
};

/**
 * Generic in-memory job store for GPU/inference micro-services.
 *
 * Each media service (images, videos, voices) extends this with its own
 * typed job interface that adds domain-specific result fields (resultUrl,
 * videoUrl, audioUrl, etc.).
 *
 * TODO(#478): Replace the in-memory Map with Redis-backed persistence.
 */
@Injectable()
export class BaseJobService<T extends BaseJob> {
  private readonly constructorName: string = String(this.constructor.name);
  // TODO(#478): replace with Redis-backed persistence
  private readonly jobs: Map<string, T> = new Map();

  constructor(protected readonly loggerService: LoggerService) {}

  async createJob(params: {
    type: string;
    params: Record<string, unknown>;
  }): Promise<T> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const jobId = randomUUID();

    const job = {
      createdAt: new Date().toISOString(),
      jobId,
      params: params.params,
      status: 'queued',
      type: params.type,
    } as T;

    this.jobs.set(jobId, job);
    this.loggerService.log(caller, { jobId, message: 'Job created' });

    return job;
  }

  async getJob(jobId: string): Promise<T | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async updateJob(jobId: string, updates: Partial<T>): Promise<T | null> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    const updated = { ...job, ...updates };
    this.jobs.set(jobId, updated);
    return updated;
  }

  getStats(): JobStats {
    let active = 0;
    let queued = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case 'processing':
          active++;
          break;
        case 'queued':
          queued++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { active, completed, failed, queued, total: this.jobs.size };
  }
}
