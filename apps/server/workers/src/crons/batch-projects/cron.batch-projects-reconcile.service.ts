import { BatchProjectReconcileService } from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Advances Studio Batch projects whose generation is in flight (#5463), so a
 * batch the creator left mid-generation still reaches the review inbox.
 * Resolution rules live in `BatchProjectReconcileService` on the API side.
 */
@Injectable()
export class CronBatchProjectsReconcileService {
  private readonly context = 'CronBatchProjectsReconcileService';

  constructor(
    private readonly logger: LoggerService,
    private readonly reconcileService: BatchProjectReconcileService,
  ) {}

  async reconcileGeneratingProjects(): Promise<void> {
    const projectCount =
      await this.reconcileService.reconcileGeneratingProjects();
    if (projectCount > 0) {
      this.logger.log('CronBatchProjectsReconcileService completed', {
        context: this.context,
        projectCount,
      });
    }
  }
}
