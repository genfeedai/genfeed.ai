import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type WorkflowDeploymentBackfillReport = {
  brandFailures: number;
  brandsProcessed: number;
  orgFailures: number;
  organizationsProcessed: number;
};

/**
 * Hosted SaaS still runs `migrate:workflows` on every deploy. System workflows
 * live in the catalog and are installed on demand — this task must not clone
 * or unpause per-org schedules.
 */
@Injectable()
export class WorkflowDeploymentBackfillService {
  private readonly context = 'WorkflowDeploymentBackfillService';

  constructor(private readonly logger: LoggerService) {}

  async run(): Promise<WorkflowDeploymentBackfillReport> {
    const report: WorkflowDeploymentBackfillReport = {
      brandFailures: 0,
      brandsProcessed: 0,
      orgFailures: 0,
      organizationsProcessed: 0,
    };

    this.logger.log(
      'Skipping system workflow clone-on-deploy; catalog install is opt-in',
      { report, service: this.context },
    );

    return report;
  }
}
