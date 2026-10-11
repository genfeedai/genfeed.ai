import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import { refreshWorkflowActor } from '@api/authorization/brand-access/workflow-actor.util';
import type { WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  EXECUTABLE_WORKFLOW_SELECT,
  WorkflowExecutorService,
} from '@api/collections/workflows/services/workflow-executor.service';
import { reconcileSeededWorkflowBeforeScheduledRun } from '@api/collections/workflows/services/workflow-platform-seed-reconcile.util';
import {
  computeNextRunAtOrThrow,
  isSchedulableTimezone,
} from '@api/collections/workflows/utils/cron-schedule.util';
import { isCanonicalPlatformSeed } from '@api/collections/workflows/utils/workflow-platform-seed.util';
import {
  resolveScheduleInitiatingActor,
  toScheduleInitiatingActorWrite,
  type WorkflowSchedulePrincipal,
} from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { runWithOrganizationModule } from '@api/common/organization-modules/organization-module-execution.context';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isCloudDeployment } from '@genfeedai/config';
import { WorkflowExecutionTrigger, WorkflowStatus } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

function toWorkflowDocument(workflow: unknown): WorkflowDocument {
  return hydrateWorkflowDefinition(workflow as Record<string, unknown>);
}

type SchedulableWorkflow = Pick<
  WorkflowDocument,
  'id' | 'isScheduleEnabled' | 'schedule' | 'timezone'
>;

/**
 * Who a scheduled fire runs as. In Cloud it is the actor bound when the schedule was
 * saved, re-checked live; a schedule without one, or whose actor lost authority, is held.
 * A seeded platform workflow that still matches its canonical template runs as the seeding
 * user under platform authority and never carries an actor.
 */
type ScheduledRunAuthority =
  | { isHeld: false; userId: string }
  | {
      isHeld: true;
      reason: 'actor-denied' | 'actor-missing' | 'platform-seed-invalid';
    };

type ScheduledRunWorkflow = {
  brandId: string | null;
  currentVersion?: { contentHash?: string | null } | null;
  organizationId: string;
  platformSeedKey: string | null;
  scheduleInitiatingActor: Prisma.JsonValue | null;
  userId: string;
};

/** The scheduler needs the stored version hash to prove a platform-marked row is canonical. */
const SCHEDULED_WORKFLOW_SELECT = {
  ...EXECUTABLE_WORKFLOW_SELECT,
  currentVersion: {
    select: {
      ...EXECUTABLE_WORKFLOW_SELECT.currentVersion.select,
      contentHash: true,
    },
  },
  platformSeedKey: true,
  scheduleInitiatingActor: true,
  templateInstantiationKey: true,
} as const;

/**
 * Owns the producer side of workflow cron scheduling.
 *
 * Schedules live as BullMQ Job Schedulers on the `workflow-execution` queue
 * (one scheduler per workflow, keyed on the workflow id). Upserts are
 * idempotent across API replicas, so exactly one delayed fire exists per tick
 * regardless of replica count — no in-process CronJobs, no fire-window locks.
 *
 * Workers consume the resulting `scheduled-fire` jobs and call back into
 * `executeScheduledWorkflow` to run the workflow.
 */
@Injectable()
export class WorkflowSchedulerService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService)
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly workflowExecutorService: WorkflowExecutorService,
    private readonly workflowExecutionQueueService: WorkflowExecutionQueueService,
    private readonly moduleAccess: OrganizationModuleAccessService,
    private readonly brandAccess: BrandAccessService,
  ) {}

  async onModuleInit() {
    if (!this.configService.isDevSchedulersEnabled) {
      this.logger.log(
        'Workflow schedulers disabled for local development',
        'WorkflowSchedulerService',
      );

      return;
    }

    // One-time boot sync: upsert a job scheduler for every enabled scheduled
    // workflow. Idempotent per scheduler id, so any number of replicas booting
    // concurrently converge on one scheduler per workflow. This seeds rows
    // created before the BullMQ migration and heals drift after restarts.
    await this.syncAllWorkflowSchedulers();
  }

  /**
   * Upsert job schedulers for all enabled scheduled workflows.
   */
  async syncAllWorkflowSchedulers(): Promise<void> {
    try {
      const workflows = await this.prisma.workflow.findMany({
        select: {
          id: true,
          isScheduleEnabled: true,
          schedule: true,
          timezone: true,
        },
        where: {
          isDeleted: false,
          isScheduleEnabled: true,
          schedule: { not: null },
          // Canonical workflow status is the lowercase enum value ('active');
          // the column is a drifted String (see schema). Must match what
          // createWorkflow / the executor persist, or scheduled rows never load.
          status: WorkflowStatus.ACTIVE,
        },
      });

      this.logger.log(
        `Syncing ${workflows.length} workflow job schedulers`,
        'WorkflowSchedulerService',
      );

      for (const workflow of workflows) {
        await this.scheduleWorkflow(workflow as SchedulableWorkflow);
      }
    } catch (error) {
      this.logger.error(
        'Failed to sync workflow job schedulers',
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Upsert the BullMQ job scheduler for a workflow's cron schedule.
   */
  async scheduleWorkflow(workflow: SchedulableWorkflow): Promise<void> {
    const workflowId = String(
      (workflow as unknown as Record<string, unknown>).id ??
        (workflow as unknown as { id: string }).id,
    );

    if (!workflow.schedule || !workflow.isScheduleEnabled) {
      await this.unscheduleWorkflow(workflowId);
      return;
    }

    try {
      await this.workflowExecutionQueueService.upsertWorkflowScheduler({
        cronExpression: workflow.schedule,
        timezone: workflow.timezone || 'UTC',
        workflowId,
      });

      this.logger.log(
        `Scheduled workflow ${workflowId} with cron: ${workflow.schedule}`,
        'WorkflowSchedulerService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule workflow ${workflowId}`,
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Remove the BullMQ job scheduler for a workflow. Idempotent.
   */
  async unscheduleWorkflow(workflowId: string): Promise<void> {
    try {
      await this.workflowExecutionQueueService.removeWorkflowScheduler(
        workflowId,
      );

      this.logger.log(
        `Unscheduled workflow ${workflowId}`,
        'WorkflowSchedulerService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to unschedule workflow ${workflowId}`,
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Execute a scheduled workflow. Called by the workers' `scheduled-fire`
   * processor — BullMQ already guarantees a single fire per tick, so no
   * cross-replica locking is needed here.
   */
  async executeScheduledWorkflow(
    workflowId: string,
    scheduledFireJobId?: string,
  ): Promise<void> {
    try {
      const workflow = await this.prisma.workflow.findFirst({
        select: SCHEDULED_WORKFLOW_SELECT,
        where: {
          id: workflowId,
          isDeleted: false,
          isScheduleEnabled: true,
          // Canonical workflow status is the lowercase enum value ('active');
          // the column is a drifted String (see schema). Must match what
          // createWorkflow / the executor persist, or scheduled rows never load.
          status: WorkflowStatus.ACTIVE,
        },
      });

      if (!workflow) {
        this.logger.warn(
          `Scheduled workflow ${workflowId} not found or inactive`,
          'WorkflowSchedulerService',
        );
        await this.unscheduleWorkflow(workflowId);
        return;
      }

      const wUserId = workflow.userId;
      const wOrgId = workflow.organizationId;

      // Skip execution for systemic workflows (templates without user/org)
      if (!wUserId || !wOrgId) {
        this.logger.warn(
          `Scheduled workflow ${workflowId} is a systemic template and cannot be executed directly`,
          'WorkflowSchedulerService',
        );
        await this.unscheduleWorkflow(workflowId);
        return;
      }

      try {
        await this.moduleAccess.assertAccess(wOrgId, 'automation');
      } catch (error: unknown) {
        if (error instanceof HttpException && error.getStatus() === 403) {
          this.logger.debug(
            `Skipped scheduled workflow ${workflowId}: Automation access is disabled or requires a subscription`,
            'WorkflowSchedulerService',
          );
          return;
        }
        throw error;
      }

      await this.markCanonicalSeedBeforeRun(workflow);
      const authority = await this.resolveScheduledRunAuthority(workflow);
      if (authority.isHeld) {
        await this.holdScheduledWorkflow(
          workflowId,
          wOrgId,
          authority.reason,
          workflow.platformSeedKey,
        );
        return;
      }

      const workflowDocument = toWorkflowDocument(workflow);
      const defaultInputValues = this.getDefaultInputValues(workflowDocument);
      const missingRequiredInputs = this.getMissingRequiredInputKeys(
        workflowDocument,
        defaultInputValues,
      );

      if (missingRequiredInputs.length > 0) {
        await this.prisma.workflow.update({
          data: {
            isScheduleEnabled: false,
            scheduleInitiatingActor: Prisma.DbNull,
          },
          where: scopedWhere(wOrgId, { id: workflowId }),
        });
        await this.unscheduleWorkflow(workflowId);

        this.logger.warn(
          `Scheduled workflow ${workflowId} disabled because required input defaults are missing: ${missingRequiredInputs.join(', ')}`,
          'WorkflowSchedulerService',
        );
        return;
      }

      // Update workflow last executed timestamp
      await this.prisma.workflow.update({
        data: {
          executionCount: { increment: 1 },
          lastExecutedAt: new Date(),
        },
        where: scopedWhere(wOrgId, { id: workflowId }),
      });

      const executePromise = runWithOrganizationModule(
        { organizationId: wOrgId, moduleId: 'automation' },
        () =>
          this.workflowExecutorService.executeManualWorkflowDocument(
            workflowDocument,
            authority.userId,
            wOrgId,
            defaultInputValues,
            {
              scheduledFireJobId,
              triggeredBy: 'schedule',
            },
            WorkflowExecutionTrigger.SCHEDULED,
          ),
      );

      executePromise.catch((error) => {
        this.logger.error(
          `Scheduled execution failed for workflow ${workflowId}`,
          error,
          'WorkflowSchedulerService',
        );
      });

      this.logger.log(
        `Started scheduled execution for workflow ${workflowId}`,
        'WorkflowSchedulerService',
      );
    } catch (error) {
      this.logger.error(
        `Failed to execute scheduled workflow ${workflowId}`,
        error,
        'WorkflowSchedulerService',
      );
    }
  }

  /**
   * Marks a canonical seeded workflow that predates the platform marker, in the same tick and
   * before its authority is resolved, so no operator step or boot ordering is involved: an
   * unmarked row is otherwise run as, or held for, a person. The reconcile rules (owner, exact
   * template hash, oldest row, unmarked) live in the reconcile util; a lost race or a failure
   * leaves the row unmarked and this tick on the existing actor rules. Self-hosted is unchanged.
   */
  private async markCanonicalSeedBeforeRun(
    workflow: ScheduledRunWorkflow & {
      id: string;
      metadata: unknown;
      templateInstantiationKey: string | null;
    },
  ): Promise<void> {
    if (!isCloudDeployment()) {
      return;
    }
    const result = await reconcileSeededWorkflowBeforeScheduledRun(
      { logger: this.logger, prisma: this.prisma },
      workflow,
    );
    if (result.status === 'marked') {
      workflow.platformSeedKey = result.platformSeedKey;
      workflow.scheduleInitiatingActor = null;
      return;
    }
    if (result.status === 'unmarked') {
      // A concurrent fire or reconcile may have marked the row (or bound an actor) after this
      // copy was read. Refresh the authority fields before they can cause a stale hold.
      const persisted = await this.prisma.workflow.findFirst({
        select: { platformSeedKey: true, scheduleInitiatingActor: true },
        where: scopedWhere(workflow.organizationId, { id: workflow.id }),
      });
      if (persisted) {
        workflow.platformSeedKey = persisted.platformSeedKey;
        workflow.scheduleInitiatingActor = persisted.scheduleInitiatingActor;
      }
    }
  }

  /**
   * Cloud runs a scheduled workflow only as the actor bound when its schedule was saved, after
   * re-reading that actor's live authority (membership, API key validity, brand access). The
   * workflow creator is never substituted. Self-hosted single-tenant keeps running as the
   * workflow owner. Anything other than a plain denial (a database outage) is rethrown to the
   * caller's handler, which logs it and leaves the schedule untouched for the next tick.
   */
  private async resolveScheduledRunAuthority(
    workflow: ScheduledRunWorkflow,
  ): Promise<ScheduledRunAuthority> {
    if (!isCloudDeployment()) {
      return { isHeld: false, userId: workflow.userId };
    }
    if (workflow.platformSeedKey) {
      // Platform authority is the seeder's, not a person's: the row must still be the exact
      // seeded template. Anything else (edited, stale, tampered, re-scoped) is a tenant
      // workflow without an actor, so it is held like any other unbound schedule.
      return isCanonicalPlatformSeed(workflow)
        ? { isHeld: false, userId: workflow.userId }
        : { isHeld: true, reason: 'platform-seed-invalid' };
    }
    const persisted = workflow.scheduleInitiatingActor ?? undefined;
    if (persisted === undefined) {
      return { isHeld: true, reason: 'actor-missing' };
    }
    try {
      const actor = await refreshWorkflowActor(
        this.prisma,
        this.brandAccess,
        persisted,
        workflow.organizationId,
      );
      if (!actor) {
        return { isHeld: true, reason: 'actor-missing' };
      }
      if (workflow.brandId) {
        await this.brandAccess.assert(actor, workflow.brandId, this.prisma);
      }
      return { isHeld: false, userId: actor.userId };
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return { isHeld: true, reason: 'actor-denied' };
      }
      throw error;
    }
  }

  /**
   * Pauses a schedule whose actor is missing or no longer authorized, keeping the cron and
   * timezone so a person can re-enable it (which binds them), and drops the queued job. A
   * platform-marked row that no longer matches its template also loses the marker, so it is
   * an ordinary tenant workflow from here on.
   */
  private async holdScheduledWorkflow(
    workflowId: string,
    organizationId: string,
    reason: 'actor-denied' | 'actor-missing' | 'platform-seed-invalid',
    platformSeedKey: string | null,
  ): Promise<void> {
    await this.prisma.workflow.update({
      data: {
        isScheduleEnabled: false,
        scheduleInitiatingActor: Prisma.DbNull,
        ...(reason === 'platform-seed-invalid'
          ? { platformSeedKey: null }
          : {}),
      },
      where: scopedWhere(organizationId, { id: workflowId }),
    });
    await this.unscheduleWorkflow(workflowId);

    this.logger.warn(
      this.describeHold(workflowId, reason, platformSeedKey),
      'WorkflowSchedulerService',
    );
  }

  private describeHold(
    workflowId: string,
    reason: 'actor-denied' | 'actor-missing' | 'platform-seed-invalid',
    platformSeedKey: string | null,
  ): string {
    switch (reason) {
      case 'actor-missing':
        return `Scheduled workflow ${workflowId} held: no authenticated actor is bound to its schedule. Re-enable the schedule to bind it.`;
      case 'platform-seed-invalid':
        return `Scheduled workflow ${workflowId} held: it no longer matches its seeded platform template ${platformSeedKey ?? 'unknown'}, so it needs an authenticated actor. Re-enable the schedule to bind it.`;
      default:
        return `Scheduled workflow ${workflowId} held: the actor bound to its schedule no longer has access. Re-enable the schedule to bind it.`;
    }
  }

  private isMissingInputValue(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0)
    );
  }

  /**
   * Get default input values for a workflow
   */
  private getDefaultInputValues(
    workflow: WorkflowDocument,
  ): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    if (workflow.inputVariables) {
      for (const variable of workflow.inputVariables) {
        if (variable.defaultValue !== undefined) {
          defaults[variable.key] = variable.defaultValue;
        }
      }
    }

    return defaults;
  }

  private getMissingRequiredInputKeys(
    workflow: WorkflowDocument,
    inputValues: Record<string, unknown>,
  ): string[] {
    return (workflow.inputVariables ?? [])
      .filter((variable) => {
        if (!variable.required) {
          return false;
        }

        return this.isMissingInputValue(inputValues[variable.key]);
      })
      .map((variable) => variable.key);
  }

  /**
   * Update workflow schedule.
   *
   * The single shared schedule-mutation contract (UI PATCH, agent tool, MCP,
   * brand publishing defaults all converge here): the cadence and timezone are
   * validated before persistence and scheduler registration failures surface
   * to the caller instead of logging silently.
   *
   * `principal` is the authenticated user or API key that is configuring the
   * schedule. It is persisted server-side as `scheduleInitiatingActor` while the
   * schedule is set and enabled, and rewritten on every such save. A cleared or
   * paused schedule, or a caller that supplies no principal, clears the binding
   * so no previous owner's authority survives a reconfiguration.
   */
  async updateSchedule(
    workflowId: string,
    organizationId: string,
    schedule: string | null,
    timezone: string = 'UTC',
    isEnabled: boolean = true,
    principal?: WorkflowSchedulePrincipal | null,
  ): Promise<WorkflowDocument | null> {
    const existing = await this.prisma.workflow.findFirst({
      select: {
        brandId: true,
        currentVersion: { select: { contentHash: true } },
        id: true,
        platformSeedKey: true,
      },
      where: scopedWhere(organizationId, { id: workflowId }),
    });

    if (!existing) {
      return null;
    }

    if (schedule) {
      // The timezone is half of the schedule: an unknown IANA zone would only
      // explode later inside the scheduler, so reject it up front with the
      // field the user actually got wrong.
      if (!isSchedulableTimezone(timezone)) {
        throw new BadRequestException(
          `Invalid timezone "${timezone}". Use an IANA timezone name, for example "Europe/Berlin".`,
        );
      }

      try {
        computeNextRunAtOrThrow(schedule, timezone);
      } catch {
        throw new BadRequestException(
          `Invalid cron expression "${schedule}". Use a valid cron schedule, for example "0 9 * * 1-5" for weekdays at 9:00 AM.`,
        );
      }
    }

    // A schedule save on a canonical seeded platform workflow keeps it platform-owned and
    // actor-less, so the saver's identity never reaches the platform run. A marker that no
    // longer matches its template is dropped here and the saver is bound like any tenant.
    const isPlatformSeed = isCanonicalPlatformSeed(existing);
    const initiatingActor = isPlatformSeed
      ? null
      : resolveScheduleInitiatingActor({
          isEnabled,
          organizationId,
          principal,
          schedule,
        });

    const workflow = await this.prisma.workflow.update({
      data: {
        isScheduleEnabled: isEnabled && !!schedule,
        ...(existing.platformSeedKey && !isPlatformSeed
          ? { platformSeedKey: null }
          : {}),
        schedule,
        scheduleInitiatingActor:
          toScheduleInitiatingActorWrite(initiatingActor),
        timezone,
      },
      include: { currentVersion: true },
      where: scopedWhere(organizationId, { id: workflowId }),
    });

    const workflowDocument = toWorkflowDocument(workflow);

    if (schedule && isEnabled) {
      // No try/catch: a failed registration on the save path must reach the
      // caller (the boot-sync path in scheduleWorkflow keeps its own catch).
      await this.workflowExecutionQueueService.upsertWorkflowScheduler({
        cronExpression: schedule,
        timezone: timezone || 'UTC',
        workflowId,
      });

      this.logger.log(
        `Scheduled workflow ${workflowId} with cron: ${schedule}`,
        'WorkflowSchedulerService',
      );
    } else {
      await this.unscheduleWorkflow(workflowId);
    }

    return workflowDocument;
  }
}
