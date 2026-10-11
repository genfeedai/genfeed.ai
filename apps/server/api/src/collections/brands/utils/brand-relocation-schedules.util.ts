import type { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';

/** A workflow schedule that a relocation pauses, as shown in the preview. */
export interface BrandRelocationHeldSchedule {
  id: string;
  label: string | null;
  schedule: string;
  timezone: string | null;
}

export interface BrandRelocationScheduleHold {
  /** The enabled schedules that were paused; this is the `schedulesHeld` count. */
  held: BrandRelocationHeldSchedule[];
  /**
   * Every workflow whose binding or flag changed, including a deleted one or a
   * leftover actor on a disabled schedule. Each needs its queued job removed.
   */
  touchedWorkflowIds: string[];
}

/**
 * The brand's live workflows with an enabled schedule. The relocation preview
 * and the relocation itself both read this, so the preview lists exactly the
 * schedules the move pauses.
 */
export async function findActiveBrandSchedules(
  client: Prisma.TransactionClient,
  brandId: string,
): Promise<BrandRelocationHeldSchedule[]> {
  // tenant-scope-ignore: a relocation spans the source and destination tenants; the brand id pins the workflows.
  const workflows = await client.workflow.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, label: true, schedule: true, timezone: true },
    where: {
      brandId,
      isDeleted: false,
      isScheduleEnabled: true,
      schedule: { not: null },
    },
  });
  return workflows.flatMap((workflow) =>
    workflow.schedule
      ? [
          {
            id: workflow.id,
            label: workflow.label,
            schedule: workflow.schedule,
            timezone: workflow.timezone,
          },
        ]
      : [],
  );
}

/**
 * Pause every schedule of the brand and drop its initiating actor, keeping the
 * cron expression and timezone. The actor authorized the schedule in the
 * organization it was saved in; the destination organization never granted it,
 * and moving the brand back must not bring it back. An enabled save in the new
 * organization binds a fresh actor.
 */
export async function holdBrandSchedules(
  tx: Prisma.TransactionClient,
  brandId: string,
): Promise<BrandRelocationScheduleHold> {
  const held = await findActiveBrandSchedules(tx, brandId);
  // tenant-scope-ignore: a relocation spans the source and destination tenants; the brand id pins the workflows, deleted ones included.
  const bound = await tx.workflow.findMany({
    select: {
      id: true,
      isScheduleEnabled: true,
      scheduleInitiatingActor: true,
    },
    where: { brandId },
  });
  const touchedWorkflowIds = bound
    .filter(
      (workflow) =>
        workflow.isScheduleEnabled === true ||
        workflow.scheduleInitiatingActor != null,
    )
    .map((workflow) => workflow.id);
  if (touchedWorkflowIds.length > 0) {
    // sql-risk-audit: ignore bulk-write-tenant-review -- the ids come from the brand-pinned read above in this transaction; a relocation spans the source and destination tenants.
    // tenant-scope-ignore: ids come from the brand-pinned read above inside this transaction.
    await tx.workflow.updateMany({
      data: {
        isScheduleEnabled: false,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: { id: { in: touchedWorkflowIds } },
    });
  }
  return { held, touchedWorkflowIds };
}

async function resolveWorkflowSchedulerService(
  moduleRef: ModuleRef | undefined,
): Promise<WorkflowSchedulerService | null> {
  if (!moduleRef) {
    return null;
  }
  try {
    // Deferred import: a top-level value import of the scheduler closes the
    // brands -> workflows -> brands module cycle and crashes API bootstrap
    // (the same reason DefaultRecurringContentService resolves it lazily).
    const { WorkflowSchedulerService: schedulerServiceClass } = await import(
      '@api/collections/workflows/services/workflow-scheduler.service'
    );
    return moduleRef.get(schedulerServiceClass, { strict: false });
  } catch {
    return null;
  }
}

/**
 * Remove the queued scheduler job for every workflow the move paused. Runs after
 * commit and never fails the move: a job that outlives the pause is dropped when
 * it fires, because the workflow no longer has an enabled schedule. Returns how
 * many jobs could not be confirmed removed.
 */
export async function unscheduleHeldWorkflows(
  moduleRef: ModuleRef | undefined,
  logger: Pick<LoggerService, 'warn'>,
  workflowIds: readonly string[],
): Promise<number> {
  if (workflowIds.length === 0) {
    return 0;
  }
  const scheduler = await resolveWorkflowSchedulerService(moduleRef);
  if (!scheduler) {
    logger.warn(
      'Workflow scheduler unavailable; queued jobs of paused schedules will be dropped when they fire',
      { workflowCount: workflowIds.length },
    );
    return workflowIds.length;
  }
  let pending = 0;
  for (const workflowId of workflowIds) {
    try {
      await scheduler.unscheduleWorkflow(workflowId);
    } catch (error: unknown) {
      pending += 1;
      logger.warn('Failed to unschedule a workflow after relocation', {
        error: error instanceof Error ? error.message : String(error),
        workflowId,
      });
    }
  }
  return pending;
}
