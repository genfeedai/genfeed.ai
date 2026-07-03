import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowExecutionTrigger } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CronStreaksService {
  constructor(
    private readonly logger: LoggerService,
    private readonly streaksService: StreaksService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
  ) {}

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
        const { result } = await this.systemWorkflowProvenanceService.runAction(
          {
            actionType: 'streak-maintenance',
            canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
            description:
              'Processes daily streak state: at-risk reminders, streak freezes, and broken streaks.',
            inputValues: {
              referenceDate: referenceDate.toISOString(),
            },
            label: 'Streak Maintenance',
            organizationId,
            schedule: '30 0 * * *',
            source: 'CronStreaksService.processStreaks',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
          },
          () =>
            this.streaksService.processStaleStreaks(
              referenceDate,
              organizationId,
            ),
        );

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
