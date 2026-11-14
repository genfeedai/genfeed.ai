import { ActivityKey } from '@genfeedai/contracts';
import {
  createManualPostActivity,
  resolveDueManualPostReminder,
} from '@workers/crons/posts/manual-post-activity.util';
import { describe, expect, it } from 'vitest';

const SCHEDULED = new Date('2026-11-15T13:00:00.000Z');
const minutesAfter = (minutes: number) =>
  new Date(SCHEDULED.getTime() + minutes * 60_000);

describe('resolveDueManualPostReminder', () => {
  it.each([
    [0, 0],
    [29, 0],
    [30, 1],
    [89, 1],
    [90, 2],
    [30 + 60 * 23, 24],
    [30 + 60 * 40, 24],
  ])(
    'is reminder %s minutes after the scheduled time -> %s',
    (minutes, due) => {
      expect(
        resolveDueManualPostReminder(SCHEDULED, minutesAfter(minutes)),
      ).toBe(due);
    },
  );
});

describe('createManualPostActivity', () => {
  const post = {
    brandId: 'brand-1',
    description: '<p>Shipped X quote scheduling.</p>',
    groupId: 'group-1',
    id: 'post-1',
    organizationId: 'org-1',
    quoteTweetId: '1856322244019101979',
    scheduledDate: SCHEDULED,
    userId: 'user-1',
  };

  it('asks for the post by hand with a prefilled X link on the first notice', () => {
    const activity = createManualPostActivity(post, 0, SCHEDULED);

    expect(activity).toMatchObject({
      entityId: 'post-1',
      key: ActivityKey.POST_MANUAL_POST_NEEDED,
      organizationId: 'org-1',
      userId: 'user-1',
      value:
        'X would not take this quote post through the API. Post it by hand.\n\nOpen in X: https://x.com/intent/post?text=Shipped+X+quote+scheduling.&url=https%3A%2F%2Fx.com%2Fi%2Fstatus%2F1856322244019101979',
    });
    expect(activity.alert?.deduplicationKey).toBe(
      'content-publish-manual/post-1/0',
    );
  });

  it('says how late the post is on a reminder and keys it by reminder number', () => {
    const activity = createManualPostActivity(post, 3, minutesAfter(150));

    expect(activity.value).toContain(
      'Still waiting for you to post this quote by hand (2 h late). Post it or skip it.',
    );
    expect(activity.alert?.deduplicationKey).toBe(
      'content-publish-manual/post-1/3',
    );
  });
});
