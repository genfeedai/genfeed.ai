import {
  type StreakMaintenanceEvaluation,
  type StreakMaintenanceRequest,
  type StreakRecordMaintenanceRequest,
  StreaksService,
} from '@api/collections/streaks/services/streaks.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildStreakOrganizationWorkflowDefinition,
  buildStreakRecordWorkflowDefinition,
  buildStreakSweepWorkflowDefinition,
  STREAK_MAINTENANCE_ACTION_IDS,
} from '@workers/crons/streaks/streak-maintenance-workflow-definition';

const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';

@Injectable()
export class CronStreaksService implements OnModuleInit {
  constructor(
    private readonly streaksService: StreaksService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.DISCOVER_ORGANIZATIONS,
      async ({ input }) => {
        const request = input.request as { referenceDate: string };
        const organizationIds =
          await this.streaksService.listStreakOrganizationIds();
        return {
          items: organizationIds.map(
            (organizationId) =>
              ({
                organizationId,
                referenceDate: request.referenceDate,
              }) satisfies StreakMaintenanceRequest,
          ),
        };
      },
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.DISCOVER_RECORDS,
      ({ input }) =>
        this.streaksService.discoverMaintenanceRecords(
          input.request as StreakMaintenanceRequest,
        ),
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.EVALUATE,
      ({ input }) =>
        this.streaksService.evaluateMaintenanceRecord(
          input.request as StreakRecordMaintenanceRequest,
        ),
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.APPLY_FREEZE,
      ({ input }) =>
        this.streaksService.applyMaintenanceFreeze(
          this.unwrapBranch(input.evaluation),
        ),
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.BREAK,
      ({ input }) =>
        this.streaksService.breakMaintenanceStreak(
          this.unwrapBranch(input.evaluation),
        ),
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.NOTIFY_AT_RISK,
      ({ input }) =>
        this.streaksService.notifyMaintenanceAtRisk(
          this.unwrapBranch(input.evaluation),
        ),
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.NOTIFY_FREEZE,
      ({ input }) =>
        this.streaksService.notifyMaintenanceFreeze(
          input.evaluation as StreakMaintenanceEvaluation,
        ),
    );
    this.systemWorkflowRunner.registerAction(
      STREAK_MAINTENANCE_ACTION_IDS.NOTIFY_BROKEN,
      ({ input }) =>
        this.streaksService.notifyMaintenanceBroken(
          input.evaluation as StreakMaintenanceEvaluation,
        ),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildStreakSweepWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildStreakOrganizationWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildStreakRecordWorkflowDefinition(),
    );
  }

  /**
   * Processes daily streak state per organization: at-risk reminders,
   * streak freezes, and broken streaks. Fired at 00:30 UTC by the
   * platform BullMQ schedule. Each
   * organization's run is recorded as a system workflow execution.
   */
  async processStreaks(): Promise<void> {
    const referenceDate = new Date();
    const definition = buildStreakSweepWorkflowDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          request: { referenceDate: referenceDate.toISOString() },
        },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'streak_maintenance_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `streak-sweep-${referenceDate.toISOString().slice(0, 10)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  private unwrapBranch(value: unknown): StreakMaintenanceEvaluation {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as { data: StreakMaintenanceEvaluation }).data;
    }
    return value as StreakMaintenanceEvaluation;
  }
}
