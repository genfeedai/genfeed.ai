import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@workers/config/config.service';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { CronReviewGateTimeoutService } from '@workers/crons/review-gate/cron.review-gate-timeout.service';
import { CronStreaksService } from '@workers/crons/streaks/cron.streaks.service';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { SYSTEM_SWEEP_JOBS } from '@workers/scheduling/system-sweeps.constants';
import { SystemSweepsProcessor } from '@workers/scheduling/system-sweeps.processor';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('SystemSweepsProcessor', () => {
  let processor: SystemSweepsProcessor;
  let postsService: { publishScheduledPosts: ReturnType<typeof vi.fn> };
  let reviewGateService: {
    resolveTimedOutReviewGates: ReturnType<typeof vi.fn>;
  };
  let streaksService: { processStreaks: ReturnType<typeof vi.fn> };
  let tiktokService: { checkPendingTiktokPosts: ReturnType<typeof vi.fn> };
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
    postsService = { publishScheduledPosts: vi.fn() };
    reviewGateService = { resolveTimedOutReviewGates: vi.fn() };
    streaksService = { processStreaks: vi.fn() };
    tiktokService = { checkPendingTiktokPosts: vi.fn() };
    youtubeService = { checkScheduledYoutubeVideos: vi.fn() };
    configService = { isDevSchedulersEnabled: true };
    logger = { debug: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSweepsProcessor,
        { provide: ConfigService, useValue: configService },
        { provide: CronPostsService, useValue: postsService },
        {
          provide: CronReviewGateTimeoutService,
          useValue: reviewGateService,
        },
        { provide: CronStreaksService, useValue: streaksService },
        { provide: CronTiktokStatusService, useValue: tiktokService },
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

  it('dispatches the TikTok status sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.TIKTOK_STATUS));

    expect(tiktokService.checkPendingTiktokPosts).toHaveBeenCalledOnce();
  });

  it('dispatches the YouTube status sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.YOUTUBE_STATUS));

    expect(youtubeService.checkScheduledYoutubeVideos).toHaveBeenCalledOnce();
  });

  it('dispatches the streak maintenance sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.STREAK_MAINTENANCE));

    expect(streaksService.processStreaks).toHaveBeenCalledOnce();
  });

  it('dispatches the review-gate timeout sweep', async () => {
    await processor.process(jobNamed(SYSTEM_SWEEP_JOBS.REVIEW_GATE_TIMEOUT));

    expect(reviewGateService.resolveTimedOutReviewGates).toHaveBeenCalledOnce();
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
