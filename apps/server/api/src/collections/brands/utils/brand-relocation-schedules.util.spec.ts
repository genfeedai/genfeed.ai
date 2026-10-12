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
    agentStrategy: {
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
          isDeleted: false,
          isScheduleEnabled: true,
          label: 'Daily',
          schedule: '0 9 * * *',
          timezone: 'UTC',
        },
        // A row the query should never return, but a null cron is not a schedule.
        {
          id: 'wf_2',
          isDeleted: false,
          isScheduleEnabled: true,
          label: null,
          schedule: null,
          timezone: null,
        },
      ],
    });

    await expect(findActiveBrandSchedules(asTx(tx), 'brand')).resolves.toEqual([
      { id: 'wf_1', label: 'Daily', schedule: '0 9 * * *', timezone: 'UTC' },
    ]);
    expect(tx.workflow.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        isDeleted: true,
        isScheduleEnabled: true,
        label: true,
        schedule: true,
        timezone: true,
      },
      where: {
        brandId: 'brand',
        isDeleted: false,
        isScheduleEnabled: true,
        schedule: { not: null },
      },
    });
  });

  it('pauses enabled schedules and clears every leftover binding, touching nothing else', async () => {
    const row = {
      isDeleted: false,
      label: null,
      schedule: '* * * * *',
      timezone: null,
    };
    const tx = client({
      bound: [
        {
          ...row,
          id: 'wf_on',
          isScheduleEnabled: true,
          label: 'On',
          scheduleInitiatingActor: BOUND,
        },
        // Paused but still bound, and a deleted workflow still enabled.
        {
          ...row,
          id: 'wf_old',
          isScheduleEnabled: false,
          scheduleInitiatingActor: BOUND,
        },
        {
          ...row,
          id: 'wf_deleted',
          isDeleted: true,
          isScheduleEnabled: true,
          scheduleInitiatingActor: null,
        },
        // Nothing to undo: skipped.
        {
          ...row,
          id: 'wf_idle',
          isScheduleEnabled: null,
          scheduleInitiatingActor: null,
        },
      ],
    });

    const result = await holdBrandSchedules(asTx(tx), 'brand');

    // One read of the brand's workflows serves both the held list and the
    // bindings to clear.
    expect(tx.workflow.findMany).toHaveBeenCalledTimes(1);
    expect(result.held).toEqual([
      { id: 'wf_on', label: 'On', schedule: '* * * * *', timezone: null },
    ]);
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

  it("drops the actor bound on the brand's strategies, so moving back cannot re-arm it", async () => {
    const tx = client({});

    await holdBrandSchedules(asTx(tx), 'brand');

    expect(tx.agentStrategy.updateMany).toHaveBeenCalledExactlyOnceWith({
      data: { scheduleInitiatingActor: Prisma.DbNull },
      where: {
        brandId: 'brand',
        NOT: { scheduleInitiatingActor: { equals: Prisma.DbNull } },
      },
    });
  });

  it('writes nothing when no workflow is scheduled or bound', async () => {
    const tx = client({
      bound: [
        {
          id: 'wf_idle',
          isDeleted: false,
          isScheduleEnabled: false,
          label: null,
          schedule: '0 9 * * *',
          scheduleInitiatingActor: null,
          timezone: null,
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
