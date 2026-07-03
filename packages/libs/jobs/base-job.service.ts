import { randomUUID } from 'node:crypto';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

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

/** Jobs are transient operational state: expire after 24 hours. */
export const JOB_TTL_SECONDS = 86400;

/**
 * Generic Redis-backed job store for GPU/inference micro-services.
 *
 * Each media service (images, videos, voices) extends this with its own
 * typed job interface that adds domain-specific result fields (resultUrl,
 * videoUrl, audioUrl, etc.) and passes a unique key namespace.
 *
 * Jobs are written through to Redis (`jobs:{namespace}:{jobId}`) so state
 * survives a service restart. The in-memory Map serves as a fast-path cache
 * and as the sole store when Redis is unavailable.
 */
@Injectable()
export class BaseJobService<T extends BaseJob> {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly jobs: Map<string, T> = new Map();

  constructor(
    protected readonly loggerService: LoggerService,
    private readonly namespace: string,
    private readonly redisService?: RedisService,
  ) {}

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
    await this.persistJob(job);
    this.loggerService.log(caller, { jobId, message: 'Job created' });

    return job;
  }

  async getJob(jobId: string): Promise<T | null> {
    const cached = this.jobs.get(jobId);
    if (cached) {
      return cached;
    }

    const persisted = await this.readJob(jobId);
    if (persisted) {
      this.jobs.set(jobId, persisted);
    }

    return persisted;
  }

  async updateJob(jobId: string, updates: Partial<T>): Promise<T | null> {
    const job = await this.getJob(jobId);
    if (!job) {
      return null;
    }

    const updated = { ...job, ...updates };
    this.jobs.set(jobId, updated);
    await this.persistJob(updated);
    return updated;
  }

  async getStats(): Promise<JobStats> {
    const persisted = await this.readAllJobs();
    const jobs = persisted ?? Array.from(this.jobs.values());

    let active = 0;
    let queued = 0;
    let completed = 0;
    let failed = 0;

    for (const job of jobs) {
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

    return { active, completed, failed, queued, total: jobs.length };
  }

  private buildJobKey(jobId: string): string {
    return `jobs:${this.namespace}:${jobId}`;
  }

  private async persistJob(job: T): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      await publisher.setex(
        this.buildJobKey(job.jobId),
        JOB_TTL_SECONDS,
        JSON.stringify(job),
      );
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        jobId: job.jobId,
        message: 'Failed to persist job to Redis',
      });
    }
  }

  private async readJob(jobId: string): Promise<T | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return null;
    }

    try {
      const raw = await publisher.get(this.buildJobKey(jobId));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        jobId,
        message: 'Failed to read job from Redis',
      });
      return null;
    }
  }

  /** Returns null when Redis is unavailable so callers can fall back to memory. */
  private async readAllJobs(): Promise<T[] | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return null;
    }

    try {
      const keys = await this.collectJobKeys(publisher);
      const rawJobs = await Promise.all(keys.map((key) => publisher.get(key)));
      const jobs: T[] = [];

      for (const [index, raw] of rawJobs.entries()) {
        if (!raw) {
          continue;
        }

        try {
          jobs.push(JSON.parse(raw) as T);
        } catch (error) {
          this.loggerService.warn(caller, {
            error: error instanceof Error ? error.message : String(error),
            key: keys[index],
            message: 'Skipping corrupt job entry in Redis',
          });
        }
      }

      return jobs;
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to read jobs from Redis',
      });
      return null;
    }
  }

  private async collectJobKeys(publisher: Redis): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await publisher.scan(
        cursor,
        'MATCH',
        `jobs:${this.namespace}:*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    return keys;
  }
}
