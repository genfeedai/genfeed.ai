import {
  findActiveBrandSchedules,
  holdBrandSchedules,
} from '@api/collections/brands/utils/brand-relocation-schedules.util';
import { Prisma } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

const BOUND = { organizationId: 'org-source', userId: 'saved-by' };

function client(rows: { active?: unknown[]; bound?: unknown[] }) {
  return {
    workflow: {
      findMany: vi.fn(async (args: { select: Record<string, boolean> }) =>
        args.select.scheduleInitiatingActor
          ? (rows.bound ?? [])
          : (rows.active ?? []),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const asTx = (value: ReturnType<typeof client>) =>
  value as unknown as Prisma.TransactionClient;

describe('brand relocation schedule hold (#6689)', () => {
  it('lists the live workflows of the brand that have an enabled schedule', async () => {
    const tx = client({
      active: [
        {
          id: 'wf_1',
          label: 'Daily',
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
        // A row the query should never return, but a null cron is not a schedule.
        { id: 'wf_2', label: null, schedule: null, timezone: null },
      ],
    });

    await expect(findActiveBrandSchedules(asTx(tx), 'brand')).resolves.toEqual([
      { id: 'wf_1', label: 'Daily', schedule: '0 9 * * *', timezone: 'UTC' },
    ]);
    expect(tx.workflow.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      select: { id: true, label: true, schedule: true, timezone: true },
      where: {
        brandId: 'brand',
        isDeleted: false,
        isScheduleEnabled: true,
        schedule: { not: null },
      },
    });
  });

  it('pauses enabled schedules and clears every leftover binding, touching nothing else', async () => {
    const tx = client({
      active: [
        { id: 'wf_on', label: 'On', schedule: '* * * * *', timezone: null },
      ],
      bound: [
        {
          id: 'wf_on',
          isScheduleEnabled: true,
          scheduleInitiatingActor: BOUND,
        },
        // Paused but still bound, and a deleted workflow still enabled.
        {
          id: 'wf_old',
          isScheduleEnabled: false,
          scheduleInitiatingActor: BOUND,
        },
        {
          id: 'wf_deleted',
          isScheduleEnabled: true,
          scheduleInitiatingActor: null,
        },
        // Nothing to undo: skipped.
        {
          id: 'wf_idle',
          isScheduleEnabled: null,
          scheduleInitiatingActor: null,
        },
      ],
    });

    const result = await holdBrandSchedules(asTx(tx), 'brand');

    expect(result.held.map(({ id }) => id)).toEqual(['wf_on']);
    expect(result.touchedWorkflowIds).toEqual([
      'wf_on',
      'wf_old',
      'wf_deleted',
    ]);
    expect(tx.workflow.updateMany).toHaveBeenCalledExactlyOnceWith({
      data: {
        isScheduleEnabled: false,
        scheduleInitiatingActor: Prisma.DbNull,
      },
      where: { id: { in: ['wf_on', 'wf_old', 'wf_deleted'] } },
    });
  });

  it('writes nothing when no workflow is scheduled or bound', async () => {
    const tx = client({
      bound: [
        {
          id: 'wf_idle',
          isScheduleEnabled: false,
          scheduleInitiatingActor: null,
        },
      ],
    });

    await expect(holdBrandSchedules(asTx(tx), 'brand')).resolves.toEqual({
      held: [],
      touchedWorkflowIds: [],
    });
    expect(tx.workflow.updateMany).not.toHaveBeenCalled();
  });
});
