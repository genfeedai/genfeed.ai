import {
  type AgentStrategyDueConfig,
  isAgentStrategyDue,
} from '@api/collections/agent-strategies/services/agent-strategy-due.util';
import { PLATFORM_WORKFLOW_SCHEDULE_SOURCE } from '@api/collections/workflows/system-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';

/**
 * Templates whose sweep only makes sense for an organization with at least
 * one active strategy that is due or has accepted pending work to recover.
 * `analytics-sync` and `content-loop-autopilot` have no per-item due state —
 * they run on their own catalog cadence for every org regardless (AC-5).
 */
const DUE_STRATEGY_GATED_TEMPLATE_ID = 'proactive-agent-strategies';

const WORKFLOWS = {
  'content-learning.reconcile': {
    canonicalId: 'content-learning.reconcile',
    interval: 5 * 60 * 1000,
  },
  'content-learning.retention': {
    canonicalId: 'content-learning.retention',
    interval: 24 * 60 * 60 * 1000,
  },
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

/**
 * Floor for how far back the in-flight check (below) looks before treating a
 * PENDING/RUNNING row as gone-stale rather than genuinely in flight. Without
 * a floor, a template with a short `interval` (e.g. `proactive-agent-strategies`
 * at 60s) would treat anything not created in the last minute or two as
 * stale, which is far too tight a window for a real in-progress run.
 */
const MIN_IN_FLIGHT_WINDOW_MS = 60 * 60 * 1000;

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
    // #5252 review (final pass): the in-flight check below has no age bound,
    // so a worker crash mid-run leaves a WorkflowExecution row RUNNING
    // forever and that org's dispatch for this template silently stops for
    // good — the row never ages out and nothing else reconciles a RUNNING
    // row. Bound it to twice this template's own cadence (floored so a
    // fast-cadence template like proactive-agent-strategies still gets a
    // sane grace window for a genuinely in-progress run).
    const inFlightSince = new Date(
      timestamp - Math.max(2 * interval, MIN_IN_FLIGHT_WINDOW_MS),
    );
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
          // Without a due active strategy or accepted pending work, dispatching
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
          // #5252 minor: the idempotency key is slotted by `interval`, so it
          // changes on the next tick regardless of whether the *previous*
          // dispatch was ever claimed. Without this check, a worker backlog
          // compounds a fresh dispatch on top of the still-queued one every
          // single tick instead of just once.
          const inFlight = await this.prisma.workflowExecution.findFirst({
            where: {
              isDeleted: false,
              organizationId: organization.id,
              result: {
                path: ['metadata', 'canonicalId'],
                equals: canonicalId,
              },
              status: {
                in: [
                  PrismaWorkflowExecutionStatus.PENDING,
                  PrismaWorkflowExecutionStatus.RUNNING,
                ],
              },
              createdAt: { gte: inFlightSince },
            },
            select: { id: true },
          });
          if (inFlight) continue;
          await this.runner.enqueueWorkflow(
            {
              actionType: canonicalId,
              canonicalId,
              idempotencyKey: `platform:${templateId}:${organization.id}:${slot}`,
              organizationId: organization.id,
              userId: organization.userId,
              source: PLATFORM_WORKFLOW_SCHEDULE_SOURCE,
              trigger: WorkflowExecutionTrigger.SCHEDULED,
            },
            { dispatchClass: SystemWorkflowDispatchClass.BACKGROUND },
          );
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
   * non-deleted strategy due now or eligible for pending transport recovery.
   * Both strategy and execution reads cover the whole organization page;
   * cadence and manual-reactivation eligibility are evaluated in memory.
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
      select: { id: true, organizationId: true, config: true },
    });
    const due = new Set<string>();
    const recoveryCandidates: typeof strategies = [];
    for (const strategy of strategies) {
      if (due.has(strategy.organizationId)) continue;
      const config =
        strategy.config !== null && typeof strategy.config === 'object'
          ? (strategy.config as AgentStrategyDueConfig)
          : {};
      if (isAgentStrategyDue(config, now)) {
        due.add(strategy.organizationId);
      } else if (isAgentStrategyDue({ ...config, nextRunAt: undefined }, now)) {
        recoveryCandidates.push(strategy);
      }
    }
    if (recoveryCandidates.length === 0) return due;
    const pending = await this.prisma.workflowExecution.findMany({
      where: {
        organizationId: { in: organizationIds },
        isDeleted: false,
        status: PrismaWorkflowExecutionStatus.PENDING,
        idempotencyKey: { startsWith: 'proactive:' },
        result: { path: ['metadata', 'source'], equals: 'proactive' },
        OR: recoveryCandidates.map((strategy) => ({
          organizationId: strategy.organizationId,
          result: { path: ['metadata', 'strategyId'], equals: strategy.id },
        })),
      },
      select: { organizationId: true },
    });
    for (const execution of pending) due.add(execution.organizationId);
    return due;
  }
}
