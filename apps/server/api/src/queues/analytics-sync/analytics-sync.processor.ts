import {
  type AnalyticsSyncResult,
  AnalyticsSyncService,
} from '@api/collections/content-performance/services/analytics-sync.service';
import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  type ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

export interface AnalyticsSyncJobData {
  organizationId: string;
  brandId?: string;
  /** ISO date string — only sync analytics newer than this */
  since?: string;
  /** Whether to auto-detect last sync date for incremental sync */
  incremental?: boolean;
}

@Processor('analytics-sync')
export class AnalyticsSyncProcessor extends WorkerHost {
  private readonly circuitBreaker: ProcessorCircuitBreaker;

  constructor(
    private readonly analyticsSyncService: AnalyticsSyncService,
    private readonly logger: LoggerService,
  ) {
    super();
    this.circuitBreaker = createProcessorCircuitBreaker(
      'analytics-sync',
      this.logger,
    );
  }

  async process(job: Job<AnalyticsSyncJobData>): Promise<AnalyticsSyncResult> {
    try {
      return await this.circuitBreaker.execute(() => this.processInternal(job));
    } catch (error: unknown) {
      if (error instanceof BrokenCircuitError) {
        this.logger.warn((error as Error).message);
        throw error;
      }
      throw error;
    }
  }

  private async processInternal(
    job: Job<AnalyticsSyncJobData>,
  ): Promise<AnalyticsSyncResult> {
    const { organizationId, brandId, since, incremental } = job.data;

    this.logger.log(
      `Processing analytics sync for org=${organizationId}${brandId ? ` brand=${brandId}` : ''}`,
    );

    await job.updateProgress(10);

    let syncSince: Date | undefined;

    if (since) {
      syncSince = new Date(since);
    } else if (incremental) {
      const lastSync = await this.analyticsSyncService.getLastSyncDate(
        organizationId,
        brandId,
      );
      if (lastSync) {
        syncSince = lastSync;
      }
    }

    await job.updateProgress(20);

    const result = await this.analyticsSyncService.syncAnalytics({
      brandId,
      organizationId,
      since: syncSince,
    });

    await job.updateProgress(100);

    this.logger.log(
      `Analytics sync completed for org=${organizationId}: synced=${result.synced}, errors=${result.errors}`,
    );

    return result;
  }
}
