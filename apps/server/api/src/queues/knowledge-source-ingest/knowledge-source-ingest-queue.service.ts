import {
  KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME,
  KNOWLEDGE_SOURCE_INGEST_JOB_NAME,
  KNOWLEDGE_SOURCE_INGEST_QUEUE,
  type KnowledgeSourceBackfillJobData,
  type KnowledgeSourceIngestJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';

export function knowledgeSourceIngestJobId(
  contextBaseId: string,
  sourceId: string,
): string {
  return `kb-ingest:${contextBaseId}:${sourceId}`;
}

export function knowledgeSourceBackfillJobId(organizationId?: string): string {
  return organizationId ? `kb-backfill:${organizationId}` : 'kb-backfill:all';
}

const IN_FLIGHT_STATES = new Set(['active', 'waiting', 'delayed', 'paused']);

@Injectable()
export class KnowledgeSourceIngestQueueService {
  constructor(
    private readonly logger: LoggerService,
    @InjectQueue(KNOWLEDGE_SOURCE_INGEST_QUEUE)
    @Optional()
    private readonly queue?: Queue<
      KnowledgeSourceIngestJobData | KnowledgeSourceBackfillJobData
    >,
  ) {}

  async enqueueIngest(
    data: KnowledgeSourceIngestJobData,
  ): Promise<string | null> {
    if (!this.queue) {
      this.logger.warn('Knowledge source ingest queue unavailable', {
        contextBaseId: data.contextBaseId,
        organizationId: data.organizationId,
        sourceId: data.sourceId,
      });
      return null;
    }

    const jobId = knowledgeSourceIngestJobId(data.contextBaseId, data.sourceId);
    if (await this.hasInFlightJob(jobId)) {
      return jobId;
    }
    await this.replaceCompletedJob(jobId);

    const job = await this.queue.add(KNOWLEDGE_SOURCE_INGEST_JOB_NAME, data, {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log('Queued knowledge source ingest', {
      jobId: job.id ?? jobId,
      organizationId: data.organizationId,
      sourceId: data.sourceId,
    });

    return job.id ?? jobId;
  }

  async enqueueBackfill(
    data: KnowledgeSourceBackfillJobData = {},
  ): Promise<string | null> {
    if (!this.queue) {
      this.logger.warn('Knowledge source ingest queue unavailable', {
        organizationId: data.organizationId,
      });
      return null;
    }

    const jobId = knowledgeSourceBackfillJobId(data.organizationId);
    if (await this.hasInFlightJob(jobId)) {
      return jobId;
    }
    await this.replaceCompletedJob(jobId);

    const job = await this.queue.add(KNOWLEDGE_SOURCE_BACKFILL_JOB_NAME, data, {
      jobId,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log('Queued knowledge source backfill', {
      jobId: job.id ?? jobId,
      organizationId: data.organizationId,
    });

    return job.id ?? jobId;
  }

  private async hasInFlightJob(jobId: string): Promise<boolean> {
    if (!this.queue) {
      return false;
    }

    const existing = (await this.queue.getJob(jobId)) as Job | undefined;
    if (!existing) {
      return false;
    }

    const state = await existing.getState();
    return IN_FLIGHT_STATES.has(state);
  }

  private async replaceCompletedJob(jobId: string): Promise<void> {
    if (!this.queue) {
      return;
    }

    const existing = (await this.queue.getJob(jobId)) as Job | undefined;
    if (!existing) {
      return;
    }

    const state = await existing.getState();
    if (IN_FLIGHT_STATES.has(state)) {
      return;
    }

    await existing.remove();
  }
}
