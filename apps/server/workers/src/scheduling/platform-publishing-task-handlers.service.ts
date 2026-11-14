import { Injectable } from '@nestjs/common';
import { CronBrandedDispatchRecoveryService } from '@workers/crons/branded-dispatch-recovery/cron.branded-dispatch-recovery.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import { CronPatternExtractionService } from '@workers/crons/pattern-extraction/cron.pattern-extraction.service';
import { CronManualPostRemindersService } from '@workers/crons/posts/cron.manual-post-reminders.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';
import { CronSocialSourceResyncService } from '@workers/crons/social-sources/cron.social-source-resync.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronTrendsService } from '@workers/crons/trends/cron.trends.service';
import { CronXReplyWatchService } from '@workers/crons/x-replies/cron.x-reply-watch.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import {
  PLATFORM_SCHEDULED_TASKS,
  type PlatformTaskHandler,
} from '@workers/scheduling/platform-schedules.constants';
import { ThreadCommentDeliveryService } from '@workers/services/thread-comment-delivery.service';

/** Publishing, social-platform sync and engagement tasks. */
@Injectable()
export class PlatformPublishingTaskHandlers {
  constructor(
    private readonly posts: CronPostsService,
    private readonly manualPostReminders: CronManualPostRemindersService,
    private readonly threadComments: ThreadCommentDeliveryService,
    private readonly tiktok: CronTiktokStatusService,
    private readonly youtubeMessages: CronYoutubeMessagesService,
    private readonly youtubeStatus: CronYoutubeStatusService,
    private readonly xReplyWatch: CronXReplyWatchService,
    private readonly rss: CronRssAutopostService,
    private readonly socialSourceResync: CronSocialSourceResyncService,
    private readonly engagementTriggers: CronEngagementTriggersService,
    private readonly patternExtraction: CronPatternExtractionService,
    private readonly trends: CronTrendsService,
    private readonly streaks: CronStreaksService,
    private readonly reviewGate: CronReviewGateTimeoutService,
    private readonly brandedDispatchRecovery: CronBrandedDispatchRecoveryService,
  ) {}

  createHandlers() {
    return {
      [PLATFORM_SCHEDULED_TASKS.ENGAGEMENT_TRIGGERS]: () =>
        this.engagementTriggers.processArmedRules(),
      [PLATFORM_SCHEDULED_TASKS.GLOBAL_TRENDS_REFRESH]: () =>
        this.trends.refreshGlobalTrends(),
      [PLATFORM_SCHEDULED_TASKS.BRANDED_DISPATCH_RECOVERY]: () =>
        this.brandedDispatchRecovery.recoverExpiredDispatches(),
      [PLATFORM_SCHEDULED_TASKS.PATTERN_EXTRACTION]: () =>
        this.patternExtraction.computeDailyPatterns(),
      [PLATFORM_SCHEDULED_TASKS.POSTS_MANUAL_POST_REMINDERS]: () =>
        this.manualPostReminders.sendDueReminders(),
      [PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH]: () =>
        this.posts.publishScheduledPosts(),
      [PLATFORM_SCHEDULED_TASKS.POSTS_THREAD_COMMENTS]: () =>
        this.threadComments.publishDueThreadComments(),
      [PLATFORM_SCHEDULED_TASKS.REVIEW_GATE_TIMEOUT]: () =>
        this.reviewGate.resolveTimedOutReviewGates(),
      [PLATFORM_SCHEDULED_TASKS.RSS_AUTOPOST]: () =>
        this.rss.pollEnabledSources(),
      [PLATFORM_SCHEDULED_TASKS.SOCIAL_SOURCE_OWN_ACCOUNT_RESYNC]: () =>
        this.socialSourceResync.resyncDueSources(),
      [PLATFORM_SCHEDULED_TASKS.STREAK_MAINTENANCE]: () =>
        this.streaks.processStreaks(),
      [PLATFORM_SCHEDULED_TASKS.TIKTOK_STATUS]: () =>
        this.tiktok.checkPendingTiktokPosts(),
      [PLATFORM_SCHEDULED_TASKS.X_REPLY_WATCH]: () =>
        this.xReplyWatch.watchRecentPostReplies(),
      [PLATFORM_SCHEDULED_TASKS.YOUTUBE_MESSAGES]: () =>
        this.youtubeMessages.syncYoutubeMessages(),
      [PLATFORM_SCHEDULED_TASKS.YOUTUBE_STATUS]: () =>
        this.youtubeStatus.checkScheduledYoutubeVideos(),
    } satisfies Partial<
      Record<
        (typeof PLATFORM_SCHEDULED_TASKS)[keyof typeof PLATFORM_SCHEDULED_TASKS],
        PlatformTaskHandler
      >
    >;
  }
}
