import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import { buildXQuoteIntentUrl } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { readPostString } from '@workers/services/scheduled-post.utils';

/** First reminder after the scheduled time, then one per interval. */
export const MANUAL_POST_FIRST_REMINDER_MS = 30 * 60_000;
export const MANUAL_POST_REMINDER_INTERVAL_MS = 60 * 60_000;
/** Reminders stop after a day; the target stays listed until it is closed. */
export const MANUAL_POST_MAX_REMINDERS = 24;

export type ManualPostSubject = {
  brandId?: string | null;
  description: string;
  groupId?: string | null;
  id: string;
  organizationId: string;
  quoteTweetId?: string | null;
  scheduledDate: Date | null;
  userId?: string | null;
};

export function toManualPostSubject(post: PostEntity): ManualPostSubject {
  return {
    brandId: readPostString(post, ['brandId']) ?? null,
    description: post.description ?? '',
    groupId: post.groupId ?? null,
    id: post.id.toString(),
    organizationId: readPostString(post, ['organizationId']) ?? '',
    quoteTweetId: post.quoteTweetId ?? null,
    scheduledDate: post.scheduledDate ?? null,
    userId: readPostString(post, ['userId']) ?? null,
  };
}

/**
 * Which reminder is due now: 0 before the first (30 minutes after the scheduled
 * time), then 1 for the first hour-long window, and so on up to the cap.
 */
export function resolveDueManualPostReminder(
  scheduledDate: Date,
  now: Date,
): number {
  const lateMs = now.getTime() - scheduledDate.getTime();
  if (lateMs < MANUAL_POST_FIRST_REMINDER_MS) {
    return 0;
  }
  const reminder =
    1 +
    Math.floor(
      (lateMs - MANUAL_POST_FIRST_REMINDER_MS) /
        MANUAL_POST_REMINDER_INTERVAL_MS,
    );
  return Math.min(reminder, MANUAL_POST_MAX_REMINDERS);
}

function formatLateness(lateMs: number): string {
  const hours = Math.floor(lateMs / 3_600_000);
  if (hours >= 1) {
    return `${hours} h`;
  }
  return `${Math.max(1, Math.round(lateMs / 60_000))} min`;
}

/**
 * The notification asking the person to post a quote by hand. Reminder 0 is the
 * first one, sent when X refuses the quote; the deduplication key makes each
 * reminder number fire once however often the sweep runs.
 */
export function createManualPostActivity(
  post: ManualPostSubject,
  reminder: number,
  now: Date = new Date(),
): RecordActivityInput {
  const text = htmlToText(post.description).trim();
  const intentUrl = buildXQuoteIntentUrl(text, post.quoteTweetId);
  const lateMs = post.scheduledDate
    ? Math.max(0, now.getTime() - post.scheduledDate.getTime())
    : 0;
  const lead =
    reminder === 0
      ? 'X would not take this quote post through the API. Post it by hand.'
      : `Still waiting for you to post this quote by hand (${formatLateness(lateMs)} late). Post it or skip it.`;
  const value = `${lead}\n\nOpen in X: ${intentUrl}`;

  return {
    alert: {
      deduplicationKey: `${ActivityKey.POST_MANUAL_POST_NEEDED}/${post.id}/${reminder}`,
      payload: {
        groupId: post.groupId ?? null,
        intentUrl,
        postId: post.id,
        reminder,
      },
      source: { id: post.id, type: 'post' },
    },
    brandId: post.brandId ?? null,
    data: { intentUrl, reminder },
    entityId: post.id,
    entityModel: ActivityEntityModel.POST,
    key: ActivityKey.POST_MANUAL_POST_NEEDED,
    organizationId: post.organizationId,
    source: ActivitySource.POST,
    userId: post.userId ?? null,
    value,
  };
}
