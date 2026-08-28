import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { StreaksService } from '@server/collections/streaks/services/streaks.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';

@Injectable()
export class CronStreaksService implements OnModuleInit {
  constructor(
    private readonly logger: LoggerService,
    private readonly streaksService: StreaksService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
      ({ input }) =>
        this.streaksService.processStaleStreaks(
          new Date(String(input.referenceDate ?? '')),
          String(input.organizationId ?? ''),
        ),
    );
  }

  /**
   * Processes daily streak state per organization: at-risk reminders,
   * streak freezes, and broken streaks. Fired at 00:30 UTC by the
   * system-sweeps BullMQ Job Scheduler (SystemSweepsProcessor). Each
   * organization's run is recorded as a system workflow execution.
   */
  async processStreaks(): Promise<void> {
    const referenceDate = new Date();
    const organizationIds =
      await this.streaksService.listStreakOrganizationIds();

    const totals = { atRisk: 0, broken: 0, frozen: 0 };

    for (const organizationId of organizationIds) {
      try {
        const { result } = await this.systemWorkflowRunner.runAction<{
          atRisk: number;
          broken: number;
          frozen: number;
        }>({
          actionType: 'streak-maintenance',
          canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
          inputValues: {
            organizationId,
            referenceDate: referenceDate.toISOString(),
          },
          organizationId,
          source: 'CronStreaksService.processStreaks',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
        });

        totals.atRisk += result.atRisk;
        totals.broken += result.broken;
        totals.frozen += result.frozen;
      } catch (error: unknown) {
        this.logger.error('Streak maintenance failed for organization', {
          error: (error as Error)?.message,
          organizationId,
        });
      }
    }

    this.logger.log('CronStreaksService completed', {
      ...totals,
      organizations: organizationIds.length,
    });
  }
}
