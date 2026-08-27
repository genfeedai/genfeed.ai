import { AnalyticsSyncWorkflowService } from '@server/collections/workflows/services/analytics-sync-workflow.service';
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
  const analyticsCollectionState = {
    markFailedBatch: vi.fn(),
    markPending: vi.fn(),
  };

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
    analyticsCollectionState.markFailedBatch.mockResolvedValue(undefined);
    analyticsCollectionState.markPending.mockResolvedValue(undefined);

    service = new AnalyticsSyncWorkflowService(
      logger as never,
      postsService as never,
      queueService as never,
      cacheService as never,
      analyticsCollectionState as never,
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

  it('queries due Facebook posts by organization and enqueues credential chunks', async () => {
    postsService.findAll.mockResolvedValue({
      docs: Array.from({ length: 51 }, (_, index) => ({
        id: `post-${index}`,
        analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
        brandId: 'brand-1',
        credentialId: 'credential-1',
        externalId: `facebook-${index}`,
        organizationId: 'org-1',
        platform: CredentialPlatform.FACEBOOK,
      })),
    });

    const result = await service.runFacebookAnalytics('org-1');

    expect(postsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
        where: expect.objectContaining({
          analyticsNextCollectAt: { lte: new Date('2026-06-24T09:00:00.000Z') },
          isAnalyticsEnabled: { not: false },
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        }),
      },
      expect.objectContaining({
        limit: 500,
        page: 1,
        pagination: true,
      }),
      false,
    );
    expect(queueService.add).toHaveBeenCalledTimes(2);
    expect(queueService.add).toHaveBeenNthCalledWith(
      1,
      'analytics-facebook',
      expect.objectContaining({
        attemptKey: 'analyticsFacebookSync:org-1:495081',
        posts: expect.arrayContaining([
          expect.objectContaining({
            id: 'post-0',
            credentialId: 'credential-1',
            organizationId: 'org-1',
            platform: CredentialPlatform.FACEBOOK,
          }),
        ]),
      }),
      expect.objectContaining({ attempts: 3 }),
    );
    expect(analyticsCollectionState.markPending).toHaveBeenCalledWith({
      attemptKey: 'analyticsFacebookSync:org-1:495081',
      requestedAt: new Date('2026-06-24T09:00:00.000Z'),
      targets: expect.arrayContaining([
        {
          brandId: 'brand-1',
          id: 'post-0',
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        },
      ]),
    });
    expect(result).toMatchObject({
      action: 'analyticsFacebookSync',
      enqueued: 2,
      organizationId: 'org-1',
      posts: 51,
      status: 'enqueued',
    });
  });

  it('keyset-pages due posts and enqueues each page before fetching the next', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({
      id: `post-${String(index).padStart(3, '0')}`,
      analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
      brandId: 'brand-1',
      credentialId: 'credential-1',
      externalId: `facebook-${index}`,
      organizationId: 'org-1',
      platform: CredentialPlatform.FACEBOOK,
    }));
    const secondPage = [
      {
        id: 'post-500',
        analyticsNextCollectAt: new Date('2026-06-24T08:30:00.000Z'),
        brandId: 'brand-1',
        credentialId: 'credential-1',
        externalId: 'facebook-500',
        organizationId: 'org-1',
        platform: CredentialPlatform.FACEBOOK,
      },
    ];
    const callOrder: string[] = [];
    postsService.findAll.mockImplementation(async () => {
      callOrder.push('findAll');
      return postsService.findAll.mock.calls.length === 1
        ? { docs: firstPage }
        : { docs: secondPage };
    });
    queueService.add.mockImplementation(async () => {
      callOrder.push('enqueue');
      return { id: 'job-1' };
    });

    const result = await service.runFacebookAnalytics('org-1');

    expect(postsService.findAll).toHaveBeenCalledTimes(2);
    expect(postsService.findAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
      }),
      expect.objectContaining({ limit: 500, page: 1, pagination: true }),
      false,
    );
    expect(postsService.findAll).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                {
                  analyticsNextCollectAt: {
                    gt: new Date('2026-06-24T08:00:00.000Z'),
                  },
                },
                {
                  AND: [
                    {
                      analyticsNextCollectAt: new Date(
                        '2026-06-24T08:00:00.000Z',
                      ),
                    },
                    { id: { gt: 'post-499' } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
      expect.objectContaining({ limit: 500, page: 1, pagination: true }),
      false,
    );
    expect(result.posts).toBe(501);
    expect(result.enqueued).toBe(11);
    expect(callOrder.slice(0, 3)).toEqual(['findAll', 'enqueue', 'enqueue']);
    expect(callOrder).toContain('enqueue');
    const firstEnqueue = callOrder.indexOf('enqueue');
    const secondFind = callOrder.indexOf('findAll', 1);
    expect(firstEnqueue).toBeGreaterThan(-1);
    expect(secondFind).toBeGreaterThan(firstEnqueue);
  });

  it('groups Twitter analytics batches by credential and skips malformed posts', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-1',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'tweet-1',
          platform: CredentialPlatform.TWITTER,
        },
        {
          id: 'post-2',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'tweet-2',
          platform: CredentialPlatform.TWITTER,
        },
        {
          id: 'post-without-credential',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          externalId: 'tweet-3',
          platform: CredentialPlatform.TWITTER,
        },
      ],
    });

    const result = await service.runTwitterAnalytics('org-1');

    expect(postsService.findAll).toHaveBeenCalledWith(
      {
        orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
        where: expect.objectContaining({
          analyticsNextCollectAt: { lte: new Date('2026-06-24T09:00:00.000Z') },
          organizationId: 'org-1',
          platform: CredentialPlatform.TWITTER,
        }),
      },
      expect.objectContaining({
        limit: 500,
        page: 1,
        pagination: true,
      }),
      false,
    );
    expect(queueService.add).toHaveBeenCalledWith(
      'analytics-twitter',
      expect.objectContaining({
        attemptKey: 'analyticsTwitterSync:org-1:990162',
        credentialId: 'credential-1',
        posts: [
          {
            id: 'post-1',
            brandId: 'brand-1',
            externalId: 'tweet-1',
            organizationId: 'org-1',
          },
          {
            id: 'post-2',
            brandId: 'brand-1',
            externalId: 'tweet-2',
            organizationId: 'org-1',
          },
        ],
      }),
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

  it('groups YouTube analytics batches by credential within the workflow organization', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-1',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'video-1',
          platform: CredentialPlatform.YOUTUBE,
        },
        {
          id: 'post-2',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'video-2',
          platform: CredentialPlatform.YOUTUBE,
        },
        {
          id: 'post-without-credential',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          externalId: 'video-3',
          platform: CredentialPlatform.YOUTUBE,
        },
      ],
    });

    const result = await service.runYouTubeAnalytics('org-1');

    expect(queueService.add).toHaveBeenCalledWith(
      'analytics-youtube',
      expect.objectContaining({
        attemptKey: 'youtubeAnalyticsSync:org-1:495081',
        brandId: 'brand-1',
        credentialId: 'credential-1',
        organizationId: 'org-1',
        posts: [
          {
            id: 'post-1',
            brandId: 'brand-1',
            externalId: 'video-1',
            organizationId: 'org-1',
          },
          {
            id: 'post-2',
            brandId: 'brand-1',
            externalId: 'video-2',
            organizationId: 'org-1',
          },
        ],
      }),
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

  it('enqueues an organization refresh page-by-page without pagination:false', async () => {
    postsService.findAll.mockResolvedValue({ docs: [] });

    const result = await service.runOrganizationRefresh('org-1');

    expect(result).toEqual({
      enqueued: 0,
      organizationId: 'org-1',
      posts: 0,
      skipped: 0,
    });
    expect(postsService.findAll).toHaveBeenCalled();
    for (const [query, options] of postsService.findAll.mock.calls) {
      expect(query.where).not.toHaveProperty('analyticsNextCollectAt');
      expect(options).toEqual(
        expect.objectContaining({
          page: 1,
          pagination: true,
        }),
      );
      expect(options.pagination).not.toBe(false);
    }
  });

  it('records a retryable scoped failure when queue dispatch fails', async () => {
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-1',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'facebook-1',
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        },
      ],
    });
    queueService.add.mockRejectedValueOnce({ response: { status: 503 } });

    await expect(service.runFacebookAnalytics('org-1')).rejects.toEqual({
      response: { status: 503 },
    });

    expect(analyticsCollectionState.markFailedBatch).toHaveBeenCalledWith(
      [
        {
          attemptKey: 'analyticsFacebookSync:org-1:495081',
          brandId: 'brand-1',
          id: 'post-1',
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        },
      ],
      {
        code: 'analytics.provider_unavailable',
        isRetryable: true,
        message: 'Facebook analytics is temporarily unavailable.',
      },
    );
  });

  it('preserves the queue error when recording collection failure also fails', async () => {
    const queueError = { response: { status: 503 } };
    const stateError = new Error('state write failed');
    postsService.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-1',
          analyticsNextCollectAt: new Date('2026-06-24T08:00:00.000Z'),
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'facebook-1',
          organizationId: 'org-1',
          platform: CredentialPlatform.FACEBOOK,
        },
      ],
    });
    queueService.add.mockRejectedValueOnce(queueError);
    analyticsCollectionState.markFailedBatch.mockRejectedValueOnce(stateError);

    await expect(service.runFacebookAnalytics('org-1')).rejects.toBe(
      queueError,
    );
    expect(logger.error).toHaveBeenCalledWith(
      'AnalyticsSyncWorkflowService failed to record analytics collection failure',
      stateError,
      {
        attemptKey: 'analyticsFacebookSync:org-1:495081',
        queueName: 'analytics-facebook',
      },
    );
  });
});
