import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { CronManualPostRemindersService } from '@workers/crons/posts/cron.manual-post-reminders.service';
import { describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-15T15:00:00.000Z');
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000);

function post(id: string, scheduledDate: Date | null) {
  return {
    brandId: 'brand-1',
    description: 'Shipped it.',
    groupId: 'group-1',
    id,
    lastAttemptAt: scheduledDate,
    organizationId: 'org-1',
    quoteTweetId: '1856322244019101979',
    scheduledDate,
    userId: 'user-1',
  };
}

interface SweepResult {
  queries: Array<Record<string, unknown>>;
  recorded: RecordActivityInput[];
}

/** `pages` are the batches the database returns, one per query. */
async function sweep(
  pages: ReturnType<typeof post>[][],
  failFor?: string,
): Promise<SweepResult> {
  const recorded: RecordActivityInput[] = [];
  const queries: Array<Record<string, unknown>> = [];
  const findMany = vi.fn((query: Record<string, unknown>) => {
    queries.push(query);
    return Promise.resolve(pages[queries.length - 1] ?? []);
  });
  const service = new CronManualPostRemindersService(
    { error: vi.fn() } as unknown as LoggerService,
    { post: { findMany } } as never as PrismaService,
    {
      record: vi.fn((activity: RecordActivityInput) => {
        if (activity.entityId === failFor) {
          return Promise.reject(new Error('record failed'));
        }
        recorded.push(activity);
        return Promise.resolve(undefined);
      }),
    } as unknown as ActivityRecorderService,
  );
  await service.sendDueReminders(NOW);
  return { queries, recorded };
}

describe('CronManualPostRemindersService', () => {
  it('reminds only about posts past their first reminder, keyed by refusal and reminder number', async () => {
    const { recorded } = await sweep([
      [
        post('too-early', minutesAgo(10)),
        post('first', minutesAgo(45)),
        post('third', minutesAgo(30 + 125)),
        post('no-date', null),
      ],
    ]);

    expect(
      recorded.map((activity) => activity.alert?.deduplicationKey),
    ).toEqual([
      `content-publish-manual/first/${minutesAgo(45).getTime()}/1`,
      `content-publish-manual/third/${minutesAgo(155).getTime()}/3`,
    ]);
  });

  it('keeps reminding the other posts when one reminder cannot be recorded', async () => {
    const { recorded } = await sweep(
      [[post('broken', minutesAgo(45)), post('fine', minutesAgo(45))]],
      'broken',
    );

    expect(recorded.map((activity) => activity.entityId)).toEqual(['fine']);
  });

  it('asks only for live, failed, top-level posts refused for a manual-post reason inside the reminder window', async () => {
    const { queries } = await sweep([[]]);

    expect(queries[0]?.where).toEqual({
      isDeleted: false,
      OR: [{ targetError: { equals: 'x_quote_refused', path: ['code'] } }],
      parentId: null,
      scheduledDate: {
        gte: new Date(NOW.getTime() - (30 + 24 * 60) * 60_000),
        lte: new Date(NOW.getTime() - 30 * 60_000),
      },
      targetExecutionState: TargetExecutionState.FAILED,
    });
  });

  it('pages through every eligible post instead of rereading the first batch', async () => {
    const full = Array.from({ length: 200 }, (_, index) =>
      post(`post-${index}`, minutesAgo(45)),
    );
    const { queries, recorded } = await sweep([
      full,
      [post('last', minutesAgo(45))],
    ]);

    expect(queries).toHaveLength(2);
    expect(queries[1]).toMatchObject({ cursor: { id: 'post-199' }, skip: 1 });
    expect(recorded).toHaveLength(201);
  });
});
