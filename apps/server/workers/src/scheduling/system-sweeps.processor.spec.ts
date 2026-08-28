import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronAgentTurnReconcileService } from '@workers/crons/agent-turn/cron.agent-turn-reconcile.service';
import { CronBatchGenerationReconcileService } from '@workers/crons/batch-generation/cron.batch-generation-reconcile.service';
import { CronEngagementTriggersService } from '@workers/crons/engagement/cron.engagement-triggers.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronRssAutopostService } from '@workers/crons/rss/cron.rss-autopost.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronTranscriptPurgeService } from '@workers/crons/transcript-purge/cron.transcript-purge.service';
import { CronWorkflowArtifactsService } from '@workers/crons/workflow-artifacts/cron.workflow-artifacts.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { SYSTEM_SWEEP_JOBS } from '@workers/scheduling/system-sweeps.constants';
import { SystemSweepsProcessor } from '@workers/scheduling/system-sweeps.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SystemSweepsProcessor', () => {
  let processor: SystemSweepsProcessor;
  let agentTurnService: {
    reconcileStrandedTurns: ReturnType<typeof vi.fn>;
  };
  let batchGenerationService: {
    reconcileSettlementShortfalls: ReturnType<typeof vi.fn>;
    resumeStrandedBatches: ReturnType<typeof vi.fn>;
  };
  let engagementService: { processArmedRules: ReturnType<typeof vi.fn> };
  let postsService: { publishScheduledPosts: ReturnType<typeof vi.fn> };
  let rssService: { pollEnabledSources: ReturnType<typeof vi.fn> };
  let reviewGateService: {
    resolveTimedOutReviewGates: ReturnType<typeof vi.fn>;
  };
  let streaksService: { processStreaks: ReturnType<typeof vi.fn> };
  let tiktokService: { checkPendingTiktokPosts: ReturnType<typeof vi.fn> };
  let transcriptPurgeService: {
    purgeExpiredTranscripts: ReturnType<typeof vi.fn>;
  };
  let workflowArtifactsService: {
    queueExpiredArtifactCleanup: ReturnType<typeof vi.fn>;
  };
  let youtubeMessagesService: { syncYoutubeMessages: ReturnType<typeof vi.fn> };
  let youtubeService: { checkScheduledYoutubeVideos: ReturnType<typeof vi.fn> };
  let configService: { isDevSchedulersEnabled: boolean };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  function jobNamed(name: string): Job {
    return { name } as Job;
  }

  beforeEach(async () => {
    agentTurnService = { reconcileStrandedTurns: vi.fn() };
    batchGenerationService = {
      reconcileSettlementShortfalls: vi.fn(),
      resumeStrandedBatches: vi.fn(),
    };
    engagementService = { processArmedRules: vi.fn() };
    postsService = { publishScheduledPosts: vi.fn() };
    rssService = { pollEnabledSources: vi.fn() };
    reviewGateService = { resolveTimedOutReviewGates: vi.fn() };
    streaksService = { processStreaks: vi.fn() };
    tiktokService = { checkPendingTiktokPosts: vi.fn() };
    transcriptPurgeService = { purgeExpiredTranscripts: vi.fn() };
    workflowArtifactsService = { queueExpiredArtifactCleanup: vi.fn() };
    youtubeMessagesService = { syncYoutubeMessages: vi.fn() };
    youtubeService = { checkScheduledYoutubeVideos: vi.fn() };
    configService = { isDevSchedulersEnabled: true };
    logger = { debug: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSweepsProcessor,
        { provide: ConfigService, useValue: configService },
        {
          provide: CronAgentTurnReconcileService,
          useValue: agentTurnService,
        },
        {
          provide: CronBatchGenerationReconcileService,
          useValue: batchGenerationService,
        },
        {
          provide: CronEngagementTriggersService,
          useValue: engagementService,
        },
        { provide: CronPostsService, useValue: postsService },
        { provide: CronRssAutopostService, useValue: rssService },
        {
          provide: CronReviewGateTimeoutService,
          useValue: reviewGateService,
        },
        { provide: CronStreaksService, useValue: streaksService },
        { provide: CronTiktokStatusService, useValue: tiktokService },
        {
          provide: CronTranscriptPurgeService,
          useValue: transcriptPurgeService,
        },
        {
          provide: CronWorkflowArtifactsService,
          useValue: workflowArtifactsService,
        },
        {
          provide: CronYoutubeMessagesService,
          useValue: youtubeMessagesService,
        },
        { provide: CronYoutubeStatusService, useValue: youtubeService },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    processor = module.get(SystemSweepsProcessor);
  });

  it('dispatches the posts publish sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.POSTS_PUBLISH));

    expect(postsService.publishScheduledPosts).toHaveBeenCalledOnce();
  });

  it('dispatches the RSS autopost sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.RSS_AUTOPOST));

    expect(rssService.pollEnabledSources).toHaveBeenCalledOnce();
  });

  it('dispatches the engagement triggers sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.ENGAGEMENT_TRIGGERS));

    expect(engagementService.processArmedRules).toHaveBeenCalledOnce();
  });

  it('dispatches the TikTok status sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.TIKTOK_STATUS));

    expect(tiktokService.checkPendingTiktokPosts).toHaveBeenCalledOnce();
  });

  it('dispatches the YouTube status sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.YOUTUBE_STATUS));

    expect(youtubeService.checkScheduledYoutubeVideos).toHaveBeenCalledOnce();
  });

  it('dispatches the YouTube inbox sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.YOUTUBE_MESSAGES));

    expect(youtubeMessagesService.syncYoutubeMessages).toHaveBeenCalledOnce();
  });

  it('dispatches the streak maintenance sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.STREAK_MAINTENANCE));

    expect(streaksService.processStreaks).toHaveBeenCalledOnce();
  });

  it('dispatches the review-gate timeout sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.REVIEW_GATE_TIMEOUT));

    expect(reviewGateService.resolveTimedOutReviewGates).toHaveBeenCalledOnce();
  });

  it('dispatches the batch generation reconcile sweep', async () => {
    await processor.process(
      jobNamed(SYSTEM_SWEEP_JOBS.BATCH_GENERATION_RECONCILE),
    );

    expect(batchGenerationService.resumeStrandedBatches).toHaveBeenCalledOnce();
  });

  it('dispatches the stranded agent-turn reconcile sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.AGENT_TURN_RECONCILE));

    expect(agentTurnService.reconcileStrandedTurns).toHaveBeenCalledOnce();
  });

  it('dispatches the batch credit settlement reconcile sweep', async () => {
    await processor.process(
      jobNamed(SYSTEM_SWEEP_JOBS.BATCH_CREDIT_SETTLEMENT_RECONCILE),
    );

    expect(
      batchGenerationService.reconcileSettlementShortfalls,
    ).toHaveBeenCalledOnce();
  });

  it('dispatches the transcript purge sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.TRANSCRIPT_PURGE));

    expect(
      transcriptPurgeService.purgeExpiredTranscripts,
    ).toHaveBeenCalledOnce();
  });

  it('dispatches the workflow artifact cleanup sweep', async () => {
    await processor.process(
      jobNamed(SYSTEM_SWEEP_JOBS.WORKFLOW_ARTIFACT_CLEANUP),
    );

    expect(
      workflowArtifactsService.queueExpiredArtifactCleanup,
    ).toHaveBeenCalledOnce();
  });

  it('warns on unknown job names without dispatching', async () => {
    await processor.process(jobNamed('unknown-sweep'));

    expect(logger.warn).toHaveBeenCalled();
    expect(postsService.publishScheduledPosts).not.toHaveBeenCalled();
  });

  it('skips dispatch when schedulers are disabled for local development', async () => {
    configService.isDevSchedulersEnabled = false;

    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.POSTS_PUBLISH));

    expect(postsService.publishScheduledPosts).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });
});
