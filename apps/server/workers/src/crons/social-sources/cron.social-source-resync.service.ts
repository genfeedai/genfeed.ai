import { SocialSourceOwnAccountResyncWorkflowService } from '@api/collections/social-sources/services/social-source-own-account-resync-workflow.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronSocialSourceResyncService {
  constructor(
    private readonly workflows: SocialSourceOwnAccountResyncWorkflowService,
  ) {}

  /**
   * Sweeps every tenant's own-account social sources for a metrics resync.
   * Fired hourly by the platform BullMQ schedule; the discovery action's own
   * tiered cadence (6h / daily / weekly) decides which sources are actually
   * due. Per-source errors are isolated so one broken account cannot stall
   * the rest of the sweep.
   */
  async resyncDueSources(): Promise<void> {
    await this.workflows.enqueueSweep();
  }
}
