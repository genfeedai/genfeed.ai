import type { StoryboardJournalSweepService } from '@api/collections/content-runs/services/storyboard-journal-sweep.service';
import type { TurboProjectReconcileService } from '@api/collections/turbo-projects/services/turbo-project-reconcile.service';
import type { TurboRunReconcileService } from '@api/services/turbo-run/turbo-run-reconcile.service';
import type { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { CronTurboRunReconcileService } from '@workers/crons/turbo-run/cron.turbo-run-reconcile.service';
import { beforeEach, describe, expect, it } from 'vitest';

const strandedTurboRuns = [
  {
    organizationId: 'org-1',
    resumeCount: 1,
    turboRunId: 'run-1',
    userId: 'user-1',
  },
  {
    organizationId: 'org-2',
    resumeCount: 0,
    turboRunId: 'run-2',
    userId: 'user-2',
  },
];

describe('CronTurboRunReconcileService', () => {
  let stranded: typeof strandedTurboRuns;
  let unqueueableRuns: Set<string>;
  let queued: Array<{ dispatchClass: unknown; job: Record<string, unknown> }>;
  let shortfallSweeps: number;
  let sweepOrder: string[];
  let isStoryboardSweepFailing: boolean;
  let generatingProjects: number;
  let logs: Array<{ context: Record<string, unknown>; message: string }>;
  let errors: string[];
  let service: CronTurboRunReconcileService;

  beforeEach(() => {
    stranded = [];
    unqueueableRuns = new Set();
    queued = [];
    shortfallSweeps = 0;
    sweepOrder = [];
    isStoryboardSweepFailing = false;
    generatingProjects = 0;
    logs = [];
    errors = [];

    service = new CronTurboRunReconcileService(
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: (message: string, context: Record<string, unknown>) => {
          logs.push({ context, message });
        },
        warn: () => {},
      } as unknown as LoggerService,
      {
        findStrandedTurboRuns: async () => stranded,
        reconcileSettlementShortfalls: async () => {
          shortfallSweeps += 1;
          sweepOrder.push('shortfalls');
        },
      } as unknown as TurboRunReconcileService,
      {
        queueTurboRun: async (
          job: Record<string, unknown>,
          dispatchClass: unknown,
        ) => {
          if (unqueueableRuns.has(job.turboRunId as string)) {
            throw new Error('redis unavailable');
          }
          queued.push({ dispatchClass, job });
          return `job-${queued.length}`;
        },
      } as unknown as TurboRunWorkflowService,
      {
        reconcileGeneratingProjects: async () => generatingProjects,
      } as unknown as TurboProjectReconcileService,
      {
        sweep: async () => {
          sweepOrder.push('storyboard');
          if (isStoryboardSweepFailing) throw new Error('database unavailable');
          return { failedCount: 0, runCount: 0 };
        },
      } as unknown as StoryboardJournalSweepService,
    );
  });

  it('re-queues every stranded run as a background resume', async () => {
    stranded = strandedTurboRuns;

    await service.resumeStrandedTurboRuns();

    expect(queued).toEqual([
      {
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        job: {
          isResume: true,
          organizationId: 'org-1',
          turboRunId: 'run-1',
          userId: 'user-1',
        },
      },
      {
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
        job: {
          isResume: true,
          organizationId: 'org-2',
          turboRunId: 'run-2',
          userId: 'user-2',
        },
      },
    ]);
  });

  it('keeps sweeping after one run fails to enqueue', async () => {
    stranded = strandedTurboRuns;
    unqueueableRuns.add('run-1');

    await service.resumeStrandedTurboRuns();

    // The second run still gets its chance — one bad run is not the sweep.
    expect(queued.map(({ job }) => job.turboRunId)).toEqual(['run-2']);
    expect(errors).toEqual(['Failed to re-queue stranded run']);
    expect(logs).toEqual([
      {
        context: expect.objectContaining({ resumedCount: 1, strandedCount: 2 }),
        message: 'CronTurboRunReconcileService completed',
      },
    ]);
  });

  it('touches the queue only when something is stranded', async () => {
    await service.resumeStrandedTurboRuns();

    expect(queued).toEqual([]);
    expect(logs).toEqual([]);
  });

  it('runs the API settlement shortfall reconciliation', async () => {
    await service.reconcileSettlementShortfalls();

    expect(shortfallSweeps).toBe(1);
  });

  it('settles storyboard journals before the sweep that expires holds', async () => {
    await service.reconcileSettlementShortfalls();

    expect(sweepOrder).toEqual(['storyboard', 'shortfalls']);
  });

  it('still runs the settlement sweep when the storyboard sweep fails', async () => {
    isStoryboardSweepFailing = true;

    await service.reconcileSettlementShortfalls();

    expect(sweepOrder).toEqual(['storyboard', 'shortfalls']);
    expect(errors).toEqual(['Storyboard journal sweep failed']);
  });

  it.each([
    [
      3,
      [
        {
          context: expect.objectContaining({ projectCount: 3 }),
          message: 'CronTurboRunReconcileService Turbo projects',
        },
      ],
    ],
    [0, []],
  ])(
    'reports %i advanced Studio Turbo projects',
    async (count, expectedLogs) => {
      generatingProjects = count;

      await service.reconcileTurboProjects();

      expect(logs).toEqual(expectedLogs);
    },
  );
});
