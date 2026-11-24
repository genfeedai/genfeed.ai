import {
  type AgentStrategyDueConfig,
  isAgentStrategyDue,
} from '@api/collections/agent-strategies/services/agent-strategy-due.util';
import { recoverStalledAgentTransfers } from '@api/collections/agent-transfers/services/agent-transfer-settlement.util';
import { PLATFORM_WORKFLOW_SCHEDULE_SOURCE } from '@api/collections/workflows/system-workflow-definition';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { SYSTEM_WORKFLOW_RUNNER } from '@api/collections/workflows/workflows.tokens';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { TaskOrchestratorService } from '@api/services/task-orchestration/task-orchestrator.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';
import { PendingWorkflowExecutionReconcileService } from '@workers/scheduling/pending-workflow-execution-reconcile.service';
import { sweepExpiryMs } from '@workers/scheduling/sweep-expiry.util';
import { WorkflowContinuationReconcileService } from '@workers/scheduling/workflow-continuation-reconcile.service';

/**
 * Templates whose sweep only makes sense for an organization with at least
 * one active strategy that is due or has accepted pending work to recover.
 * `content-loop-autopilot` has no per-item due state: it runs on its own
 * catalog cadence for every org regardless (AC-5).
 */
const DUE_STRATEGY_GATED_TEMPLATE_ID = 'proactive-agent-strategies';

/**
 * Background enrichment only runs for organizations that can use Discovery and
 * where a member signed in recently: a dormant organization gains nothing from
 * a reconcile every five minutes (#5634). Retention and armed automations keep
 * their own gates.
 */
const ACTIVE_DISCOVERY_GATED_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'content-learning.reconcile',
  'content-loop-autopilot',
]);

/**
 * Measuring the posts an organization published is part of the product, not
 * background enrichment, so it never waits for a browser session (#11097). An
 * organization that schedules a week of posts and stays away is measured all
 * the same; one that published nothing costs one query per page of the sweep.
 *
 * `analytics-collect` reads the platforms and so only runs for an organization
 * with a published post whose next collection is due; `analytics-sync` turns
 * what was collected into content performance and runs for any organization
 * that has published a post with an external id.
 */
const PUBLISHED_POST_GATED_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'analytics-collect',
  'analytics-sync',
]);

const ORGANIZATION_ACTIVITY_WINDOW_MS = 48 * 60 * 60 * 1000;

const WORKFLOWS = {
  'content-learning.reconcile': {
    canonicalId: 'content-learning.reconcile',
    interval: 5 * 60 * 1000,
  },
  'content-learning.retention': {
    canonicalId: 'content-learning.retention',
    interval: 24 * 60 * 60 * 1000,
  },
  // Reads the platforms for every published post whose collection is due and
  // writes `post_analytics`; the generic `analytics-sync` below only reads
  // those rows into content performance.
  'analytics-collect': {
    canonicalId: 'analytics.organization-refresh',
    interval: 30 * 60 * 1000,
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
    private readonly taskOrchestrator: TaskOrchestratorService,
    private readonly moduleAccess: OrganizationModuleAccessService,
  ) {}

  async reconcileContinuations(): Promise<void> {
    await this.continuations.reconcile();
  }

  async reconcilePendingExecutions(): Promise<void> {
    await this.pendingExecutions.reconcile();
  }

  async recoverWorkspaceTaskRollups(): Promise<void> {
    const recovered = await this.taskOrchestrator.recoverStalledRollups();
    if (recovered > 0) {
      this.logger.log('Recovered stalled workspace task rollups', {
        recovered,
      });
    }
  }

  async recoverAgentTransfers(): Promise<void> {
    const { failed, recovered } = await recoverStalledAgentTransfers(
      this.prisma,
      {
        onError: (error, transferId) =>
          this.logger.error('Agent transfer recovery failed', {
            error,
            transferId,
          }),
      },
    );
    if (recovered > 0 || failed > 0) {
      this.logger.log('Recovered stalled agent transfers', {
        failed,
        recovered,
      });
    }
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
      const activeDiscoveryOrganizationIds =
        ACTIVE_DISCOVERY_GATED_TEMPLATE_IDS.has(templateId)
          ? await this.findActiveDiscoveryOrganizationIds(
              organizations,
              new Date(timestamp - ORGANIZATION_ACTIVITY_WINDOW_MS),
            )
          : null;
      const publishedPostOrganizationIds =
        PUBLISHED_POST_GATED_TEMPLATE_IDS.has(templateId)
          ? await this.findOrganizationIdsWithPublishedPosts(
              organizations.map((organization) => organization.id),
              templateId === 'analytics-collect' ? new Date(timestamp) : null,
            )
          : null;
      for (const organization of organizations) {
        try {
          if (
            activeDiscoveryOrganizationIds &&
            !activeDiscoveryOrganizationIds.has(organization.id)
          ) {
            continue;
          }
          if (
            publishedPostOrganizationIds &&
            !publishedPostOrganizationIds.has(organization.id)
          ) {
            continue;
          }
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
                { sourceTemplateId: templateId },
                {
                  systemWorkflowCanonicalId: { in: [templateId, canonicalId] },
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
              canonicalId,
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
            {
              dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
              expireAfterMs: sweepExpiryMs(interval),
            },
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
   * The database resolves owner/member session existence within this page;
   * only organization IDs return, regardless of membership or session counts.
   * Discovery admission retains the page's original organization order.
   */
  private async findActiveDiscoveryOrganizationIds(
    organizations: ReadonlyArray<{ id: string }>,
    activeSince: Date,
  ): Promise<Set<string>> {
    if (organizations.length === 0) return new Set();
    const activeOrganizations = await this.prisma.organization.findMany({
      where: {
        id: { in: organizations.map((organization) => organization.id) },
        isDeleted: false,
        OR: [
          {
            user: {
              is: { sessions: { some: { updatedAt: { gte: activeSince } } } },
            },
          },
          {
            members: {
              some: {
                isDeleted: false,
                user: {
                  is: {
                    sessions: { some: { updatedAt: { gte: activeSince } } },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
      take: organizations.length,
    });
    const activeOrganizationIds = new Set(
      activeOrganizations.map((organization) => organization.id),
    );
    const eligible = new Set<string>();
    for (const { id: organizationId } of organizations) {
      if (!activeOrganizationIds.has(organizationId)) continue;
      if (await this.moduleAccess.canStartWork(organizationId, 'discovery')) {
        eligible.add(organizationId);
      }
    }
    return eligible;
  }

  /**
   * Organizations (within this sweep page) with at least one published,
   * non-deleted post that has an external id, so the platform can be asked
   * about it. With `dueBy`, only a post whose next collection is due by then
   * counts. The database resolves the page in one query and only organization
   * IDs return.
   */
  private async findOrganizationIdsWithPublishedPosts(
    organizationIds: string[],
    dueBy: Date | null,
  ): Promise<Set<string>> {
    if (organizationIds.length === 0) return new Set();
    const posts = await this.prisma.post.findMany({
      where: {
        organizationId: { in: organizationIds },
        isDeleted: false,
        externalId: { not: null },
        targetExecutionState: TargetExecutionState.PUBLISHED,
        ...(dueBy ? { analyticsNextCollectAt: { lte: dueBy } } : {}),
      },
      distinct: ['organizationId'],
      select: { organizationId: true },
    });
    return new Set(posts.map((post) => post.organizationId));
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
        source: 'proactive',
        OR: recoveryCandidates.map((strategy) => ({
          organizationId: strategy.organizationId,
          strategyId: strategy.id,
        })),
      },
      select: { organizationId: true },
    });
    for (const execution of pending) due.add(execution.organizationId);
    return due;
  }
}
