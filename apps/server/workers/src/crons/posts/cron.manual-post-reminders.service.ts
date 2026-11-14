import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { MANUAL_POST_ERROR_CODES } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import {
  createManualPostActivity,
  MANUAL_POST_FIRST_REMINDER_MS,
  MANUAL_POST_MAX_REMINDERS,
  MANUAL_POST_REMINDER_INTERVAL_MS,
  resolveDueManualPostReminder,
} from '@workers/crons/posts/manual-post-activity.util';

/** Posts read per sweep; a person has a handful of quotes waiting at most. */
const MANUAL_POST_REMINDER_BATCH_SIZE = 200;

/**
 * Reminds the owner about posts they were asked to publish by hand and have not
 * closed as posted or skipped. A post stays FAILED with its refusal kept until
 * the person closes it, so the sweep reads that state: first reminder 30
 * minutes after the scheduled time, then hourly for a day. Each reminder number
 * is recorded once, so running the sweep often never repeats a notice.
 */
@Injectable()
export class CronManualPostRemindersService {
  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly activityRecorder: ActivityRecorderService,
  ) {}

  async sendDueReminders(now: Date = new Date()): Promise<void> {
    try {
      const windowMs =
        MANUAL_POST_FIRST_REMINDER_MS +
        MANUAL_POST_MAX_REMINDERS * MANUAL_POST_REMINDER_INTERVAL_MS;
      const posts = await this.prisma.post.findMany({
        select: {
          brandId: true,
          description: true,
          groupId: true,
          id: true,
          organizationId: true,
          quoteTweetId: true,
          scheduledDate: true,
          userId: true,
        },
        take: MANUAL_POST_REMINDER_BATCH_SIZE,
        where: {
          isDeleted: false,
          OR: MANUAL_POST_ERROR_CODES.map((code) => ({
            targetError: { equals: code, path: ['code'] },
          })),
          parentId: null,
          scheduledDate: {
            gte: new Date(now.getTime() - windowMs),
            lte: new Date(now.getTime() - MANUAL_POST_FIRST_REMINDER_MS),
          },
          targetExecutionState: TargetExecutionState.FAILED,
        },
      });

      for (const post of posts) {
        if (!post.scheduledDate) {
          continue;
        }
        const reminder = resolveDueManualPostReminder(post.scheduledDate, now);
        if (reminder < 1) {
          continue;
        }
        try {
          await this.activityRecorder.record(
            createManualPostActivity(post, reminder, now),
          );
        } catch (error: unknown) {
          this.logger.error('Failed to record manual post reminder', {
            error: getErrorMessage(error, {
              fallback: () => undefined,
              messageSource: 'error-instance',
            }),
            postId: post.id,
          });
        }
      }
    } catch (error: unknown) {
      this.logger.error('Manual post reminder sweep failed', { error });
    }
  }
}
