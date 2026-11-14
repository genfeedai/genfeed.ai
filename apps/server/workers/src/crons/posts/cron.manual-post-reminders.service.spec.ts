import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
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
    organizationId: 'org-1',
    quoteTweetId: '1856322244019101979',
    scheduledDate,
    userId: 'user-1',
  };
}

async function sweep(
  posts: ReturnType<typeof post>[],
  failFor?: string,
): Promise<RecordActivityInput[]> {
  const recorded: RecordActivityInput[] = [];
  const service = new CronManualPostRemindersService(
    { error: vi.fn() } as unknown as LoggerService,
    {
      post: { findMany: vi.fn().mockResolvedValue(posts) },
    } as never as PrismaService,
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
  return recorded;
}

describe('CronManualPostRemindersService', () => {
  it('reminds only about posts past their first reminder, keyed by reminder number', async () => {
    const recorded = await sweep([
      post('too-early', minutesAgo(10)),
      post('first', minutesAgo(45)),
      post('third', minutesAgo(30 + 125)),
      post('no-date', null),
    ]);

    expect(
      recorded.map((activity) => activity.alert?.deduplicationKey),
    ).toEqual([
      'content-publish-manual/first/1',
      'content-publish-manual/third/3',
    ]);
  });

  it('keeps reminding the other posts when one reminder cannot be recorded', async () => {
    const recorded = await sweep(
      [post('broken', minutesAgo(45)), post('fine', minutesAgo(45))],
      'broken',
    );

    expect(recorded.map((activity) => activity.entityId)).toEqual(['fine']);
  });
});
