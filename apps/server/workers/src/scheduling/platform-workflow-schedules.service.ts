import {
  type AgentStrategyDueConfig,
  isAgentStrategyDue,
} from '@api/collections/agent-strategies/services/agent-strategy-due.util';
import { PLATFORM_WORKFLOW_SCHEDULE_SOURCE } from '@api/collections/workflows/system-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';

/**
 * Templates whose sweep only makes sense for an organization with at least
 * one active strategy that is actually due right now (#4961 AC-1, #5162).
 * `analytics-sync` and `content-loop-autopilot` have no per-item due state —
 * they run on their own catalog cadence for every org regardless (AC-5).
 */
const DUE_STRATEGY_GATED_TEMPLATE_ID = 'proactive-agent-strategies';

const WORKFLOWS = {
  'analytics-sync': {
    canonicalId: 'analytics-sync',
    interval: 6 * 60 * 60 * 1000,
  },
  'content-loop-autopilot': {
    canonicalId: 'content-loop-autopilot',
    interval: 24 * 60 * 60 * 1000,
  },
  'proactive-agent-strategies': {
    canonicalId: 'agent.autopilot.proactive',
    interval: 60 * 1000,
  },
} as const;

@Injectable()
export class PlatformWorkflowSchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYSTEM_WORKFLOW_RUNNER)
    private readonly runner: SystemWorkflowRunnerService,
    private readonly logger: LoggerService,
    private readonly continuations: WorkflowContinuationReconcileService,
    private readonly pendingExecutions: PendingWorkflowExecutionReconcileService,
  ) {}

  async reconcileContinuations(): Promise<void> {
    await this.continuations.reconcile();
  }

  async reconcilePendingExecutions(): Promise<void> {
    await this.pendingExecutions.reconcile();
  }

  async sweep(
    templateId: keyof typeof WORKFLOWS,
    timestamp: number,
  ): Promise<void> {
    const { canonicalId, interval } = WORKFLOWS[templateId];
    const slot = Math.floor(timestamp / interval);
    const failures: Error[] = [];
    let cursor: string | undefined;
    while (true) {
      const organizations = await this.prisma.organization.findMany({
        where: { isDeleted: false, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: 100,
        select: { id: true, userId: true },
      });
      const dueOrganizationIds =
        templateId === DUE_STRATEGY_GATED_TEMPLATE_ID
          ? await this.findOrganizationIdsWithDueStrategy(
              organizations.map((organization) => organization.id),
            )
          : null;
      for (const organization of organizations) {
        try {
          // #4961 AC-1 / #5162: without a due active strategy, dispatching
          // this org's proactive-agent-strategies run does no useful work —
          // it only occupies a platform-sweep queue slot every minute, for
          // every org, forever. Skip before the installed-workflow lookup
          // below so an org with no strategies costs one query, not two.
          if (dueOrganizationIds && !dueOrganizationIds.has(organization.id)) {
            continue;
          }
          // Paused and soft-deleted installations remain explicit tenant controls.
          // tenant-scope-ignore: D1 treats deleted installations as tenant opt-out controls; the organization filter remains mandatory
          const installed = await this.prisma.workflow.findFirst({
            where: {
              organizationId: organization.id,
              OR: [
                {
                  metadata: { path: ['sourceTemplateId'], equals: templateId },
                },
                {
                  metadata: {
                    path: ['systemWorkflow', 'canonicalId'],
                    equals: templateId,
                  },
                },
                {
                  metadata: {
                    path: ['systemWorkflow', 'canonicalId'],
                    equals: canonicalId,
                  },
                },
              ],
            },
            select: { id: true },
          });
          if (installed) continue;
          await this.runner.enqueueWorkflow({
            actionType: canonicalId,
            canonicalId,
            idempotencyKey: `platform:${templateId}:${organization.id}:${slot}`,
            organizationId: organization.id,
            userId: organization.userId,
            source: PLATFORM_WORKFLOW_SCHEDULE_SOURCE,
            trigger: WorkflowExecutionTrigger.SCHEDULED,
          });
        } catch (error) {
          const failure = new Error(
            `Platform workflow ${templateId} failed for organization ${organization.id}`,
            { cause: error },
          );
          failures.push(failure);
          this.logger.error(failure.message, {
            error,
            organizationId: organization.id,
          });
        }
      }
      if (organizations.length < 100) break;
      cursor = organizations[organizations.length - 1].id;
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        `Platform workflow ${templateId} sweep failed`,
      );
  }

  /**
   * Organizations (within this sweep page) that have at least one active,
   * non-deleted strategy due to run right now. One query for the whole page
   * rather than one per organization — `isAgentStrategyDue` is evaluated in
   * memory since "due" depends on parsing each strategy's JSON `config`.
   */
  private async findOrganizationIdsWithDueStrategy(
    organizationIds: string[],
  ): Promise<Set<string>> {
    if (organizationIds.length === 0) return new Set();
    const now = new Date();
    const strategies = await this.prisma.agentStrategy.findMany({
      where: {
        organizationId: { in: organizationIds },
        isActive: true,
        isDeleted: false,
      },
      select: { organizationId: true, config: true },
    });
    const due = new Set<string>();
    for (const strategy of strategies) {
      if (due.has(strategy.organizationId)) continue;
      const config =
        strategy.config !== null && typeof strategy.config === 'object'
          ? (strategy.config as AgentStrategyDueConfig)
          : {};
      if (isAgentStrategyDue(config, now)) {
        due.add(strategy.organizationId);
      }
    }
    return due;
  }
}
