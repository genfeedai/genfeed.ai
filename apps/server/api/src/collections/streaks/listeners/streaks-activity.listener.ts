import { StreaksService } from '@api/collections/streaks/services/streaks.service';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from '@api/services/activity-recording/activity-recorded.event';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/** Qualifying recorded activities advance the author's content streak. */
@Injectable()
export class StreaksActivityListener {
  private readonly context = { service: StreaksActivityListener.name };

  constructor(
    private readonly streaksService: StreaksService,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent(ACTIVITY_RECORDED_EVENT)
  async handleActivityRecorded(event: ActivityRecordedEvent): Promise<void> {
    const pairs = new Map<
      string,
      { createdAt: Date; organizationId: string; userId: string }
    >();
    for (const activity of event.activities) {
      if (
        !activity.userId ||
        !activity.organizationId ||
        !this.streaksService.isQualifyingActivityKey(activity.key)
      ) {
        continue;
      }
      pairs.set(`${activity.organizationId}:${activity.userId}`, {
        createdAt: activity.createdAt,
        organizationId: activity.organizationId,
        userId: activity.userId,
      });
    }
    for (const pair of pairs.values()) {
      try {
        await this.streaksService.checkAndUpdate(
          pair.userId,
          pair.organizationId,
          pair.createdAt,
        );
      } catch (error: unknown) {
        this.logger.warn('Failed to update streak after activity record', {
          ...this.context,
          error,
          organizationId: pair.organizationId,
        });
      }
    }
  }
}
