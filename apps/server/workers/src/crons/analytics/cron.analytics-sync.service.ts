import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { QueueService } from '@api/queues/core/queue.service';
import {
  ANALYTICS_SYNC_QUEUE,
  AnalyticsSyncJobData,
} from '@genfeedai/queue-contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronAnalyticsSyncService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly QUEUE_NAME = ANALYTICS_SYNC_QUEUE;

  constructor(
    private readonly logger: LoggerService,
    private readonly organizationsService: OrganizationsService,
    private readonly queueService: QueueService,
  ) {}

  async triggerAnalyticsSync(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const orgs = await this.organizationsService.findAll(
        { where: { isDeleted: false } },
        { pagination: false },
      );

      const docs = (orgs as unknown as { docs: Array<{ _id: unknown }> }).docs;

      if (!docs || docs.length === 0) {
        this.logger.log(`${url} no organizations found`);
        return;
      }

      this.logger.log(`${url} found ${docs.length} organizations to sync`);

      for (const org of docs) {
        const window = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
        const organizationId = String(org._id);
        const jobData: AnalyticsSyncJobData = {
          incremental: true,
          organizationId,
        };

        await this.queueService.add(this.QUEUE_NAME, jobData, {
          attempts: 3,
          backoff: { delay: 5000, type: 'exponential' },
          jobId: `analytics-sync-${organizationId}-${window}`,
        });
      }

      this.logger.log(
        `${url} completed - queued ${docs.length} analytics-sync jobs`,
      );
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
