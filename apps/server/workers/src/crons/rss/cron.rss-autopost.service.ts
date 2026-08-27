import { RssSourcesService } from '@api/collections/rss-sources/services/rss-sources.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronRssAutopostService {
  constructor(
    private readonly logger: LoggerService,
    private readonly rssSourcesService: RssSourcesService,
  ) {}

  /**
   * Polls every enabled RSS source. Fired every 15 minutes by the
   * system-sweeps BullMQ Job Scheduler. Per-source errors are isolated so
   * one broken feed cannot stall the rest of the sweep.
   */
  async pollEnabledSources(): Promise<void> {
    const sources = await this.rssSourcesService.listEnabledForSweep();
    this.logger.log('CronRssAutopostService found sources', {
      total: sources.length,
    });

    for (const source of sources) {
      try {
        await this.rssSourcesService.pollSource(source.id, {
          ...(source.brandId ? { brandId: source.brandId } : {}),
          organizationId: source.organizationId,
          userId: source.userId,
        });
      } catch (error: unknown) {
        this.logger.error('RSS autopost poll failed for source', {
          error: error instanceof Error ? error.message : 'Unknown error',
          organizationId: source.organizationId,
          sourceId: source.id,
        });
      }
    }
  }
}
