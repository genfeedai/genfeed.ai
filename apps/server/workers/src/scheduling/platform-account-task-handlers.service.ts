import { Injectable } from '@nestjs/common';
import { CronCredentialsService } from '@workers/crons/credentials/cron.credentials.service';
import { CronCreditsService } from '@workers/crons/credits/cron.credits.service';
import { CronLifecycleEmailsService } from '@workers/crons/lifecycle-emails/cron.lifecycle-emails.service';
import { CronOAuthClientCleanupService } from '@workers/crons/oauth-client-cleanup/cron.oauth-client-cleanup.service';
import { QueueMetricsService } from '@workers/monitoring/queue-metrics.service';
import {
  PLATFORM_SCHEDULED_TASKS,
  type PlatformTaskHandler,
} from '@workers/scheduling/platform-schedules.constants';

/** Billing, credential, email and queue-metrics tasks. */
@Injectable()
export class PlatformAccountTaskHandlers {
  constructor(
    private readonly credits: CronCreditsService,
    private readonly credentials: CronCredentialsService,
    private readonly lifecycleEmails: CronLifecycleEmailsService,
    private readonly oauthClientCleanup: CronOAuthClientCleanupService,
    private readonly queueMetrics: QueueMetricsService,
  ) {}

  createHandlers() {
    return {
      [PLATFORM_SCHEDULED_TASKS.LIFECYCLE_EMAILS]: () =>
        this.lifecycleEmails.processLifecycleEmails(),
      [PLATFORM_SCHEDULED_TASKS.CREATOR_SUBSCRIPTION_RENEWAL]: () =>
        this.credits.renewCreatorSubscriptions(),
      [PLATFORM_SCHEDULED_TASKS.CREDENTIAL_TOKEN_REFRESH]: () =>
        this.credentials.refreshExpiringTokens(),
      [PLATFORM_SCHEDULED_TASKS.FREE_TRIAL_EXPIRY]: () =>
        this.credits.expireFreeTrials(),
      [PLATFORM_SCHEDULED_TASKS.LIFETIME_DEAL_CREDIT_GRANT]: () =>
        this.credits.grantLifetimeDealCredits(),
      [PLATFORM_SCHEDULED_TASKS.OAUTH_CLIENT_CLEANUP]: () =>
        this.oauthClientCleanup.deleteAbandonedClients(),
      [PLATFORM_SCHEDULED_TASKS.QUEUE_METRICS_PUBLISH]: () =>
        this.queueMetrics.publishQueueMetrics(),
      [PLATFORM_SCHEDULED_TASKS.REFERRAL_REWARD_SETTLEMENT]: () =>
        this.credits.settleReferralRewards(),
    } satisfies Partial<
      Record<
        (typeof PLATFORM_SCHEDULED_TASKS)[keyof typeof PLATFORM_SCHEDULED_TASKS],
        PlatformTaskHandler
      >
    >;
  }
}
