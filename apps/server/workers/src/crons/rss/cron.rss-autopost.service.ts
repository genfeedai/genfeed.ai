import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { RssSourcesService } from '@server/collections/rss-sources/services/rss-sources.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';

@Injectable()
export class CronRssAutopostService {
  constructor(
    private readonly logger: LoggerService,
    private readonly rssSourcesService: RssSourcesService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {
    this.systemWorkflowRunner.registerAction(
      SYSTEM_WORKFLOW_ACTION_IDS.RSS_SOURCE_POLL,
      async ({ input }) => {
        const sourceId = this.readRequiredString(input.sourceId, 'sourceId');
        const organizationId = this.readRequiredString(
          input.organizationId,
          'organizationId',
        );
        const userId = this.readRequiredString(input.userId, 'userId');
        const brandId =
          typeof input.brandId === 'string' && input.brandId.length > 0
            ? input.brandId
            : undefined;

        await this.rssSourcesService.pollSource(sourceId, {
          ...(brandId ? { brandId } : {}),
          organizationId,
          userId,
        });
        return { sourceId };
      },
    );
  }

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
        await this.systemWorkflowRunner.runAction({
          actionType: SYSTEM_WORKFLOW_ACTION_IDS.RSS_SOURCE_POLL,
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.RSS_SOURCE_POLL,
          inputValues: {
            ...(source.brandId ? { brandId: source.brandId } : {}),
            organizationId: source.organizationId,
            sourceId: source.id,
            userId: source.userId,
          },
          organizationId: source.organizationId,
          source: 'rss_autopost_sweep',
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

  private readRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`RSS source poll requires ${field}`);
    }
    return value;
  }
}
