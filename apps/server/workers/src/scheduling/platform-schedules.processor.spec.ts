import {
  PLATFORM_SCHEDULE_CATALOG,
  PLATFORM_SCHEDULED_TASKS,
  type PlatformScheduledTaskName,
} from '@workers/scheduling/platform-schedules.constants';
import { PlatformSchedulesProcessor } from '@workers/scheduling/platform-schedules.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function handler() {
  return vi.fn().mockResolvedValue(undefined);
}

describe('PlatformSchedulesProcessor', () => {
  const config = { isDevSchedulersEnabled: true };
  const batchGeneration = {
    reconcileSettlementShortfalls: handler(),
    resumeStrandedBatches: handler(),
  };
  const byokBilling = { processMonthlyByokBilling: handler() };
  const credentials = { refreshExpiringTokens: handler() };
  const engagement = { processArmedRules: handler() };
  const falModels = { discoverNewModels: handler() };
  const ingredients = {
    checkStuckProcessingIngredients: handler(),
    refreshMissingMetadataDimensions: handler(),
  };
  const llmIdle = { shutdownIfIdle: handler() };
  const modelDeprecation = { deprecateSupersededModels: handler() };
  const replicateModels = { discoverNewModels: handler() };
  const notificationRecovery = { recover: handler() };
  const patterns = { computeDailyPatterns: handler() };
  const posts = { publishScheduledPosts: handler() };
  const queueMetrics = { publishQueueMetrics: handler() };
  const referrals = { settleDueRewards: handler() };
  const reviewGate = { resolveTimedOutReviewGates: handler() };
  const rss = { pollEnabledSources: handler() };
  const streaks = { processStreaks: handler() };
  const tiktok = { checkPendingTiktokPosts: handler() };
  const transcripts = { purgeExpiredTranscripts: handler() };
  const trends = { refreshGlobalTrends: handler() };
  const video = {
    reconcileEditorRenders: handler(),
    reconcileRawCutClips: handler(),
  };
  const workflowArtifacts = { queueExpiredArtifactCleanup: handler() };
  const workflowContinuation = { reconcile: handler() };
  const youtubeMessages = { syncYoutubeMessages: handler() };
  const youtubeStatus = { checkScheduledYoutubeVideos: handler() };
  const logger = { debug: vi.fn() };

  const cases: Array<[PlatformScheduledTaskName, ReturnType<typeof handler>]> =
    [
      [
        PLATFORM_SCHEDULED_TASKS.BATCH_CREDIT_SETTLEMENT_RECONCILE,
        batchGeneration.reconcileSettlementShortfalls,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.BATCH_GENERATION_RECONCILE,
        batchGeneration.resumeStrandedBatches,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.BYOK_MONTHLY_BILLING,
        byokBilling.processMonthlyByokBilling,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.CREDENTIAL_TOKEN_REFRESH,
        credentials.refreshExpiringTokens,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.EDITOR_RENDER_RECONCILE,
        video.reconcileEditorRenders,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.ENGAGEMENT_TRIGGERS,
        engagement.processArmedRules,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.FAL_MODEL_DISCOVERY,
        falModels.discoverNewModels,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.GLOBAL_TRENDS_REFRESH,
        trends.refreshGlobalTrends,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.INGREDIENT_METADATA_REFRESH,
        ingredients.refreshMissingMetadataDimensions,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.INGREDIENT_PROCESSING_RECONCILE,
        ingredients.checkStuckProcessingIngredients,
      ],
      [PLATFORM_SCHEDULED_TASKS.LLM_IDLE_SHUTDOWN, llmIdle.shutdownIfIdle],
      [
        PLATFORM_SCHEDULED_TASKS.MODEL_DEPRECATION,
        modelDeprecation.deprecateSupersededModels,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.NOTIFICATION_DELIVERY_RECOVERY,
        notificationRecovery.recover,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.PATTERN_EXTRACTION,
        patterns.computeDailyPatterns,
      ],
      [PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH, posts.publishScheduledPosts],
      [
        PLATFORM_SCHEDULED_TASKS.QUEUE_METRICS_PUBLISH,
        queueMetrics.publishQueueMetrics,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.RAW_CUT_CLIP_RECONCILE,
        video.reconcileRawCutClips,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.REFERRAL_REWARD_SETTLEMENT,
        referrals.settleDueRewards,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.REPLICATE_MODEL_DISCOVERY,
        replicateModels.discoverNewModels,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.REVIEW_GATE_TIMEOUT,
        reviewGate.resolveTimedOutReviewGates,
      ],
      [PLATFORM_SCHEDULED_TASKS.RSS_AUTOPOST, rss.pollEnabledSources],
      [PLATFORM_SCHEDULED_TASKS.STREAK_MAINTENANCE, streaks.processStreaks],
      [PLATFORM_SCHEDULED_TASKS.TIKTOK_STATUS, tiktok.checkPendingTiktokPosts],
      [
        PLATFORM_SCHEDULED_TASKS.TRANSCRIPT_PURGE,
        transcripts.purgeExpiredTranscripts,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.WORKFLOW_ARTIFACT_CLEANUP,
        workflowArtifacts.queueExpiredArtifactCleanup,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.WORKFLOW_CONTINUATION_RECONCILE,
        workflowContinuation.reconcile,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.YOUTUBE_MESSAGES,
        youtubeMessages.syncYoutubeMessages,
      ],
      [
        PLATFORM_SCHEDULED_TASKS.YOUTUBE_STATUS,
        youtubeStatus.checkScheduledYoutubeVideos,
      ],
    ];

  let processor: PlatformSchedulesProcessor;

  beforeEach(() => {
    vi.clearAllMocks();
    config.isDevSchedulersEnabled = true;
    processor = new PlatformSchedulesProcessor(
      config as never,
      batchGeneration as never,
      byokBilling as never,
      credentials as never,
      engagement as never,
      falModels as never,
      ingredients as never,
      llmIdle as never,
      modelDeprecation as never,
      replicateModels as never,
      notificationRecovery as never,
      patterns as never,
      posts as never,
      queueMetrics as never,
      referrals as never,
      reviewGate as never,
      rss as never,
      streaks as never,
      tiktok as never,
      transcripts as never,
      trends as never,
      video as never,
      workflowArtifacts as never,
      workflowContinuation as never,
      youtubeMessages as never,
      youtubeStatus as never,
      logger as never,
    );
  });

  it('has one dispatcher case for every catalog entry', () => {
    expect(cases.map(([taskName]) => taskName).sort()).toEqual(
      Object.keys(PLATFORM_SCHEDULE_CATALOG).sort(),
    );
  });

  it.each(cases)('dispatches %s exactly once', async (taskName, expected) => {
    await processor.process({ name: taskName } as Job);

    expect(expected).toHaveBeenCalledOnce();
  });

  it('fails closed for unknown task names', async () => {
    await expect(
      processor.process({ name: 'unknown-task' } as Job),
    ).rejects.toThrow('Unknown platform scheduled task: unknown-task');
  });

  it('skips all dispatch when local schedulers are disabled', async () => {
    config.isDevSchedulersEnabled = false;

    await processor.process({
      name: PLATFORM_SCHEDULED_TASKS.POSTS_PUBLISH,
    } as Job);

    expect(posts.publishScheduledPosts).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledOnce();
  });
});
