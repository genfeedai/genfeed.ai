import { randomUUID } from 'node:crypto';
import type { GenerationJob } from '@images/interfaces/images.interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JobService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly jobs: Map<string, GenerationJob> = new Map();

  constructor(private readonly loggerService: LoggerService) {}

  async createJob(params: {
    type: string;
    params: Record<string, unknown>;
  }): Promise<GenerationJob> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const jobId = randomUUID();

    const job: GenerationJob = {
      createdAt: new Date().toISOString(),
      jobId,
      params: params.params,
      status: 'queued',
      type: params.type,
    };

    this.jobs.set(jobId, job);
    this.loggerService.log(caller, { jobId, message: 'Job created' });

    return job;
  }

  async getJob(jobId: string): Promise<GenerationJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async updateJob(
    jobId: string,
    updates: Partial<GenerationJob>,
  ): Promise<GenerationJob | null> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return null;
    }

    const updated = { ...job, ...updates };
    this.jobs.set(jobId, updated);
    return updated;
  }

  getStats(): {
    active: number;
    queued: number;
    completed: number;
    failed: number;
    total: number;
  } {
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
