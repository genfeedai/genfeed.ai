import { Prisma } from '@genfeedai/prisma';

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
