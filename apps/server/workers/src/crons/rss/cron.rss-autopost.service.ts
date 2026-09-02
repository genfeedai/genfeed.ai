import { RssSourceWorkflowService } from '@api/collections/rss-sources/services/rss-source-workflow.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronRssAutopostService {
  constructor(private readonly workflows: RssSourceWorkflowService) {}

  /**
   * Polls every enabled RSS source. Fired every 15 minutes by the
   * platform BullMQ schedule. Per-source errors are isolated so
   * one broken feed cannot stall the rest of the sweep.
   */
  async pollEnabledSources(): Promise<void> {
    await this.workflows.enqueueSweep();
  }
}
