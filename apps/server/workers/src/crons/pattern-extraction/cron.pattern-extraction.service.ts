import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { PatternExtractionWorkflowService } from '@workers/processors/api/queues/pattern-extraction/pattern-extraction-workflow.service';

@Injectable()
export class CronPatternExtractionService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly patternExtractionWorkflow: PatternExtractionWorkflowService,
  ) {}

  async computeDailyPatterns(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const organizationIds =
        await this.patternExtractionWorkflow.listEligibleOrganizationIds();
      const dateKey = new Date().toISOString().slice(0, 10);
      let queued = 0;
      let failed = 0;
      for (const organizationId of organizationIds) {
        try {
          await this.patternExtractionWorkflow.queueOrganization(
            organizationId,
            dateKey,
          );
          queued += 1;
        } catch (error: unknown) {
          failed += 1;
          this.logger.error(`${url} failed to queue organization`, {
            error,
            organizationId,
          });
        }
      }

      this.logger.log(`${url} enqueued organization pattern workflows`, {
        failed,
        organizations: organizationIds.length,
        queued,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }
}
