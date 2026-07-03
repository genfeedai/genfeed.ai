import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AnalyticsSyncWorkflowService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const postsService = { findAll: vi.fn() };
  const queueService = { add: vi.fn() };
  const cacheService = { acquireLock: vi.fn() };

  let service: AnalyticsSyncWorkflowService;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T09:00:00.000Z'));
    cacheService.acquireLock.mockResolvedValue(true);
    postsService.findAll.mockResolvedValue({ docs: [] });
    queueService.add.mockResolvedValue({ id: 'job-1' });

    service = new AnalyticsSyncWorkflowService(
      logger as never,
      postsService as never,
      queueService as never,
      cacheService as never,
    );
  });

  it('skips provider dispatch when the org window lock already exists', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runFacebookAnalytics('org-1');

    expect(result).toMatchObject({
      action: 'analyticsFacebookSync',
      enqueued: 0,
      organizationId: 'org-1',
      queueName: 'analytics-facebook',
      reason: 'facebook_analytics_already_enqueued',
      status: 'skipped',
    });
    expect(postsService.findAll).not.toHaveBeenCalled();
    expect(queueService.add).not.toHaveBeenCalled();
  });

  it('queries Facebook posts by organization and enqueues analytics chunks', async () => {
    postsService.findAll.mockResolvedValue({
      docs: Array.from({ length: 51 }, (_, index) => ({
        id: `post-${index}`,
        brand: 'brand-1',
        credential: { id: 'credential-1' },
        externalId: `facebook-${index}`,
        organization: 'org-1',
        platform: CredentialPlatform.FACEBOOK,
      })),
    });

    const result = await service.runFacebookAnalytics('org-1');

    expect(postsService.findAll).toHaveBeenCalledWith(
      {
        include: { credential: true },
        where: expect.objectContaining({
          isAnalyticsEnabled: { not: false },
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        }),
      },
      expect.objectContaining({ pagination: false }),
    );
    expect(queueService.add).toHaveBeenCalledTimes(2);
    expect(queueService.add).toHaveBeenNthCalledWith(
      1,
      'analytics-facebook',
      expect.objectContaining({
        posts: expect.arrayContaining([
          expect.objectContaining({
            id: 'post-0',
            credential: 'credential-1',
            organization: 'org-1',
            platform: CredentialPlatform.FACEBOOK,
          }),
        ]),
      }),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(result).toMatchObject({
      action: 'analyticsFacebookSync',
      enqueued: 2,
      organizationId: 'org-1',
      posts: 51,
      status: 'enqueued',
    });
  });

  it('groups Twitter analytics batches by credential and skips malformed posts', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-1',
          brand: 'brand-1',
          credential: { id: 'credential-1' },
          externalId: 'tweet-1',
          platform: CredentialPlatform.TWITTER,
        },
        {
          id: 'post-2',
          brand: 'brand-1',
          credential: { id: 'credential-1' },
          externalId: 'tweet-2',
          platform: CredentialPlatform.TWITTER,
        },
        {
          id: 'post-without-credential',
          brand: 'brand-1',
          externalId: 'tweet-3',
          platform: CredentialPlatform.TWITTER,
        },
      ],
    });

    const result = await service.runTwitterAnalytics('org-1');

    expect(postsService.findAll).toHaveBeenCalledWith(
      {
        include: { credential: true },
        orderBy: { publishedAt: 'desc' },
        where: expect.objectContaining({
          organizationId: 'org-1',
          platform: CredentialPlatform.TWITTER,
        }),
      },
      expect.objectContaining({ pagination: false }),
    );
    expect(queueService.add).toHaveBeenCalledWith(
      'analytics-twitter',
      {
        credentialId: 'credential-1',
        posts: [
          {
            id: 'post-1',
            brand: 'brand-1',
            externalId: 'tweet-1',
            organization: 'org-1',
          },
          {
            id: 'post-2',
            brand: 'brand-1',
            externalId: 'tweet-2',
            organization: 'org-1',
          },
        ],
      },
      expect.objectContaining({
        backoff: { delay: 5000, type: 'exponential' },
      }),
    );
    expect(result).toMatchObject({
      action: 'analyticsTwitterSync',
      enqueued: 1,
      posts: 3,
      skipped: 1,
      status: 'enqueued',
    });
  });

  it('enqueues the generic incremental analytics sync for the workflow organization', async () => {
    const result = await service.runGenericAnalyticsSync('org-1');

    expect(queueService.add).toHaveBeenCalledWith(
      'analytics-sync',
      {
        incremental: true,
        organizationId: 'org-1',
      },
      expect.objectContaining({
        attempts: 3,
        jobId: expect.stringMatching(/^analytics-sync-org-1-\d+$/),
      }),
    );
    expect(result).toMatchObject({
      action: 'analyticsGenericSync',
      enqueued: 1,
      organizationId: 'org-1',
      queueName: 'analytics-sync',
      status: 'enqueued',
    });
  });

  it('groups YouTube analytics batches by brand within the workflow organization', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-1',
          brand: 'brand-1',
          externalId: 'video-1',
          platform: CredentialPlatform.YOUTUBE,
        },
        {
          id: 'post-2',
          brand: 'brand-1',
          externalId: 'video-2',
          platform: CredentialPlatform.YOUTUBE,
        },
        {
          id: 'post-without-brand',
          externalId: 'video-3',
          platform: CredentialPlatform.YOUTUBE,
        },
      ],
    });

    const result = await service.runYouTubeAnalytics('org-1');

    expect(queueService.add).toHaveBeenCalledWith(
      'analytics-youtube',
      {
        brandId: 'brand-1',
        organizationId: 'org-1',
        posts: [
          {
            id: 'post-1',
            brand: 'brand-1',
            externalId: 'video-1',
            organization: 'org-1',
          },
          {
            id: 'post-2',
            brand: 'brand-1',
            externalId: 'video-2',
            organization: 'org-1',
          },
        ],
      },
      expect.objectContaining({ attempts: 3 }),
    );
    expect(result).toMatchObject({
      action: 'youtubeAnalyticsSync',
      enqueued: 1,
      posts: 3,
      skipped: 1,
      status: 'enqueued',
    });
  });
});
