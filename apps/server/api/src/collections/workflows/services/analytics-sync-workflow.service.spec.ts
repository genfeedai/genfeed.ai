import {
  CHAIN_ACTOR,
  executionContext,
  executionLookup,
  hiddenExecutionRow,
} from '@api/authorization/brand-access/hidden-execution-chain.fixture';
import { extensionPublicationAnalyticsDiscoveryFilter } from '@api/collections/posts/services/post-publication-capture.filters';
import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { executeAwaitedForEach } from '@api/collections/workflows/system-workflow-for-each.util';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
  ANALYTICS_GENERIC_CHILD_WORKFLOWS,
  ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { getActionDefinition } from '@genfeedai/actions';
import {
  CredentialPlatform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { Prisma } from '@genfeedai/prisma';
import { compileActionContract } from '@genfeedai/workflows/engine';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AnalyticsSyncWorkflowService', () => {
  const posts = { findAll: vi.fn() };
  const collectionState = { markPending: vi.fn() };
  const providerCollection = {
    collectFacebook: vi.fn(),
    collectThreads: vi.fn(),
  };
  const social = { collect: vi.fn() };
  const twitter = { collect: vi.fn() };
  const youtube = { collect: vi.fn() };
  const analyticsSync = {
    detectItemAlerts: vi.fn(),
    discoverItems: vi.fn(),
    getLastSyncDate: vi.fn(),
    persistItem: vi.fn(),
    syncItemMemory: vi.fn(),
  };
  const workflowQueue = { queueSystemWorkflow: vi.fn() };
  const workflowRunner = { registerWorkflow: vi.fn() };
  const outliers = { refresh: vi.fn() };
  const findExecution = vi.fn();
  const prisma = { workflowExecution: { findFirst: findExecution } };
  const brandAccess = { resolve: vi.fn() };
  const context = {
    executionId: 'run-1',
    organizationId: 'org-1',
    runId: 'run-1',
    userId: 'user-1',
    workflowId: 'workflow-1',
    workflowVersionId: 'version-1',
  };
  const account = {
    organizationId: 'org-1',
    brandId: 'brand-1',
    credentialId: 'credential-1',
  };
  let service: AnalyticsSyncWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    twitter.collect.mockResolvedValue(account);
    // An execution that persisted no actor: ordinary actor-less collection.
    findExecution.mockResolvedValue({ result: { inputValues: {} } });
    outliers.refresh.mockResolvedValue([]);
    posts.findAll.mockResolvedValue({ docs: [] });
    collectionState.markPending.mockResolvedValue(undefined);
    workflowQueue.queueSystemWorkflow.mockResolvedValue('job-1');
    service = new AnalyticsSyncWorkflowService(
      posts as never,
      collectionState as never,
      providerCollection as never,
      social as never,
      twitter as never,
      youtube as never,
      analyticsSync as never,
      workflowQueue as never,
      workflowRunner as never,
      outliers as never,
      prisma as never,
      brandAccess as never,
    );
  });

  it('retains Facebook video identity through discovery and the collection action', async () => {
    posts.findAll.mockResolvedValue({
      docs: [
        {
          id: 'post-video',
          brandId: 'brand-1',
          organizationId: 'org-1',
          externalId: 'video-1',
          platform: CredentialPlatform.FACEBOOK,
          category: PostCategory.VIDEO,
        },
      ],
    });
    const discovered = await service.discoverPosts(
      'org-1',
      {
        platforms: ['facebook'],
      },
      context,
    );
    expect(discovered.posts[0]).toMatchObject({ isVideo: true });
    providerCollection.collectFacebook.mockResolvedValue({ context: account });
    await service.collectFacebook({ item: discovered.posts[0] }, context);
    expect(providerCollection.collectFacebook).toHaveBeenCalledWith(
      expect.objectContaining({
        posts: [
          expect.objectContaining({ externalId: 'video-1', isVideo: true }),
        ],
      }),
      undefined,
    );
  });

  it.each([undefined, 'captured-post'])(
    'adds the capture fence before pagination while preserving the published-state predicate (postId %s)',
    async (postId) => {
      await service.discoverPosts(
        'org-1',
        {
          analyticsEnabledOnly: false,
          platforms: ['twitter', 'youtube'],
          postId,
        },
        context,
      );
      expect(posts.findAll).toHaveBeenCalledWith(
        {
          orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
          where: expect.objectContaining({
            organizationId: 'org-1',
            isDeleted: false,
            ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
            AND: [
              {
                OR: [
                  { source: null },
                  { source: { not: 'extension' } },
                  {
                    targetSettings: {
                      path: ['extensionCapture', 'version'],
                      equals: Prisma.AnyNull,
                    },
                  },
                  {
                    targetSettings: {
                      path: ['extensionCapture', 'version'],
                      not: 1,
                    },
                  },
                  { isAnalyticsEnabled: true },
                ],
              },
            ],
            ...(postId
              ? { id: postId }
              : { analyticsNextCollectAt: { lte: expect.any(Date) } }),
          }),
        },
        { customLabels, limit: 500, page: 1, pagination: true },
        false,
      );
    },
  );
  it.each([
    ['disabled X', 'twitter', '123', 'credential-1', false, 'post', null],
    ['X without credential', 'twitter', '123', null, true, 'post', null],
    [
      'Instagram shortcode',
      'instagram',
      'shortcode',
      'credential-1',
      true,
      'post',
      { kind: 'instagram-shortcode', value: 'shortcode' },
    ],
    [
      'Instagram without Graph ID',
      'instagram',
      null,
      'credential-1',
      true,
      'post',
      { kind: 'instagram-shortcode', value: 'shortcode' },
    ],
    [
      'LinkedIn activity',
      'linkedin',
      '123',
      'credential-1',
      true,
      'post',
      { kind: 'linkedin-activity', value: 'urn:li:activity:123' },
    ],
    [
      'Facebook pfbid',
      'facebook',
      'pfbidExample',
      'credential-1',
      true,
      'post',
      { kind: 'facebook-post-token', value: 'pfbidExample' },
    ],
    [
      'YouTube comment',
      'youtube',
      'own-comment',
      'credential-1',
      true,
      'reply',
      null,
    ],
  ] as const)(
    'omits %s capture before markPending even for forced/manual discovery',
    async (_name, platform, externalId, credentialId, isAnalyticsEnabled, publicationKind, urlIdentity) => {
      posts.findAll.mockResolvedValue({
        docs: [
          {
            id: 'captured',
            brandId: 'brand-1',
            organizationId: 'org-1',
            platform,
            externalId,
            credentialId,
            source: 'extension',
            isAnalyticsEnabled,
            targetSettings: {
              extensionCapture: { version: 1, publicationKind, urlIdentity },
            },
          },
        ],
      });
      for (const postId of [undefined, 'captured']) {
        const result = await service.discoverPosts(
          'org-1',
          {
            analyticsEnabledOnly: false,
            platforms: [platform],
            postId,
          },
          context,
        );
        expect(result).toMatchObject({ requested: 0, skipped: 1, posts: [] });
      }
      expect(collectionState.markPending).not.toHaveBeenCalled();
      expect(social.collect).not.toHaveBeenCalled();
      expect(twitter.collect).not.toHaveBeenCalled();
      expect(youtube.collect).not.toHaveBeenCalled();
      expect(providerCollection.collectFacebook).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['twitter', '123'],
    ['youtube', 'video-id'],
    ['instagram', '999'],
    ['linkedin', 'urn:li:share:123'],
    ['linkedin', 'urn:li:ugcPost:123'],
    ['facebook', '123_456'],
    ['tiktok', '123'],
  ])(
    'includes enabled capture with collector-compatible %s ID %s',
    async (platform, externalId) => {
      posts.findAll.mockResolvedValue({
        docs: [
          {
            id: 'captured',
            brandId: 'brand-1',
            organizationId: 'org-1',
            platform,
            externalId,
            credentialId: 'credential-1',
            source: 'extension',
            isAnalyticsEnabled: true,
            targetSettings: {
              extensionCapture: { version: 1, publicationKind: 'post' },
            },
          },
        ],
      });
      const result = await service.discoverPosts(
        'org-1',
        {
          analyticsEnabledOnly: false,
          platforms: [platform],
        },
        context,
      );
      expect(posts.findAll.mock.calls[0][0].where.AND).toEqual([
        extensionPublicationAnalyticsDiscoveryFilter(),
      ]);
      expect(result).toMatchObject({ requested: 1, skipped: 0 });
      expect(collectionState.markPending).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: [
            expect.objectContaining({
              id: 'captured',
              organizationId: 'org-1',
              platform,
            }),
          ],
        }),
      );
    },
  );
  it.each([
    ['api', {}],
    [null, {}],
    ['extension', {}],
    ['extension', { extensionCapture: {} }],
    ['extension', { extensionCapture: { version: null } }],
    ['extension', { extensionCapture: { version: 2 } }],
  ])(
    'preserves forced refresh for ordinary/legacy records (%s, %j)',
    async (source, targetSettings) => {
      posts.findAll.mockResolvedValue({
        docs: [
          {
            id: 'ordinary',
            brandId: 'brand-1',
            organizationId: 'org-1',
            platform: 'twitter',
            externalId: 'legacy-id',
            isAnalyticsEnabled: false,
            source,
            targetSettings,
          },
        ],
      });
      const result = await service.discoverPosts(
        'org-1',
        {
          analyticsEnabledOnly: false,
          platforms: ['twitter'],
          postId: 'ordinary',
        },
        context,
      );
      expect(result).toMatchObject({ requested: 1, skipped: 0 });
      expect(collectionState.markPending).toHaveBeenCalledOnce();
    },
  );

  it('discovers a bounded tenant-scoped set and marks collection pending', async () => {
    posts.findAll.mockResolvedValue({
      docs: [
        {
          brandId: 'brand-1',
          credentialId: 'credential-1',
          externalId: 'tweet-1',
          id: 'post-1',
          organizationId: 'org-1',
          platform: CredentialPlatform.TWITTER,
        },
      ],
    });

    const result = await service.discoverPosts(
      'org-1',
      {
        analyticsEnabledOnly: false,
        platforms: [CredentialPlatform.TWITTER],
      },
      context,
    );

    expect(result.posts).toHaveLength(1);
    expect(collectionState.markPending).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          expect.objectContaining({
            id: 'post-1',
            organizationId: 'org-1',
          }),
        ],
      }),
    );
  });

  it('collects one child-workflow item without hidden fan-out', async () => {
    const item = {
      attemptKey: 'attempt-1',
      brandId: 'brand-1',
      credentialId: 'credential-1',
      externalId: 'tweet-1',
      id: 'post-1',
      organizationId: 'org-1',
      platform: CredentialPlatform.TWITTER,
    };

    await service.collectTwitter({ item }, context);

    expect(twitter.collect).toHaveBeenCalledWith(
      {
        attemptKey: 'attempt-1',
        credentialId: 'credential-1',
        posts: [
          {
            brandId: 'brand-1',
            externalId: 'tweet-1',
            id: 'post-1',
            organizationId: 'org-1',
          },
        ],
      },
      undefined,
    );
  });

  it('refreshes each successful account once after awaited results and reports partial failure', async () => {
    const result = await service.finalizeCollection('org-1', {
      collection: {
        count: 3,
        results: [
          {
            index: 0,
            provenance: {
              executionId: 'e1',
              workflowId: 'child',
              workflowLabel: 'Child',
            },
            result: { attempted: 1, batches: 1, outlierAccount: account },
          },
          {
            index: 1,
            provenance: {
              executionId: 'e2',
              workflowId: 'child',
              workflowLabel: 'Child',
            },
            result: { attempted: 1, batches: 1, outlierAccount: account },
          },
          { index: 2, status: 'failed', error: 'provider unavailable' },
        ],
      },
    });
    expect(outliers.refresh).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      attempted: 3,
      failed: 1,
      status: 'completed_with_errors',
    });
  });
  it('waits for all deferred writes then refreshes once per resolved credential', async () => {
    let writes = 0;
    twitter.collect.mockImplementation(async () => {
      writes += 1;
      return account;
    });
    const item = {
      ...account,
      id: 'post',
      externalId: 'external',
      attemptKey: 'attempt',
      platform: CredentialPlatform.TWITTER,
    };
    const collection = await executeAwaitedForEach({
      items: [item, item, item],
      childContexts: Array.from({ length: 3 }, () => ({
        organizationId: 'org-1',
        userId: 'user',
      })),
      maxConcurrency: 2,
      failureMode: 'collect',
      executeItem: async (index) => ({
        provenance: {
          executionId: `e${index}`,
          workflowId: 'child',
          workflowLabel: 'Child',
          idempotencyKey: `key${index}`,
          nodeId: 'collect',
        },
        result: await service.collectTwitter(
          { item, deferOutlierRefresh: true },
          context,
        ),
      }),
    });
    expect(writes).toBe(3);
    expect(outliers.refresh).not.toHaveBeenCalled();
    const action = getActionDefinition('analytics.collection.finalize');
    const contract = compileActionContract('analytics.collection.finalize', {
      inputSchema: (action?.inputSchema ?? {}) as Readonly<
        Record<string, unknown>
      >,
      outputSchema: (action?.outputSchema ?? {}) as Readonly<
        Record<string, unknown>
      >,
    });
    contract.validateInput(
      { collection },
      {
        workflowId: 'workflow',
        workflowVersionId: 'v2',
        runId: 'run',
        nodeId: 'finalize',
      },
    );

    await service.finalizeCollection('org-1', { collection });
    expect(outliers.refresh).toHaveBeenCalledTimes(1);
    const second = {
      ...collection.results[0],
      result: {
        attempted: 1,
        batches: 1,
        outlierAccount: { ...account, credentialId: 'second' },
      },
    };
    outliers.refresh.mockClear();
    await service.finalizeCollection('org-1', {
      collection: { count: 4, results: [...collection.results, second] },
    });
    expect(outliers.refresh).toHaveBeenCalledTimes(2);
  });
  it('keeps legacy actions refreshing and never refreshes scheduled enqueue results', async () => {
    const item = {
      ...account,
      id: 'post',
      externalId: 'external',
      attemptKey: 'attempt',
      platform: CredentialPlatform.TWITTER,
    };
    await service.collectTwitter({ item }, context);
    expect(outliers.refresh).toHaveBeenCalledOnce();
    outliers.refresh.mockClear();
    expect(
      await service.finalizeCollection('org-1', {
        collection: { count: 1, results: [{ index: 0, jobId: 'queued' }] },
      }),
    ).toMatchObject({ attempted: 1, failed: 0, status: 'completed' });
    expect(outliers.refresh).not.toHaveBeenCalled();
  });
  it('rejects foreign result scope before refreshing any account', async () => {
    await expect(
      service.finalizeCollection('org-1', {
        collection: {
          results: [
            {
              result: {
                outlierAccount: { ...account, organizationId: 'foreign' },
              },
            },
          ],
        },
      }),
    ).rejects.toThrow('scope');
    expect(outliers.refresh).not.toHaveBeenCalled();
  });
  it('retries refresh from saved results without recollecting and handles empty/all-failed runs', async () => {
    const input = {
      collection: { results: [{ result: { outlierAccount: account } }] },
    };
    outliers.refresh.mockRejectedValueOnce(new Error('snapshot unavailable'));
    await expect(service.finalizeCollection('org-1', input)).rejects.toThrow(
      'snapshot unavailable',
    );
    await service.finalizeCollection('org-1', input);
    expect(twitter.collect).not.toHaveBeenCalled();
    expect(outliers.refresh).toHaveBeenCalledTimes(2);
    outliers.refresh.mockClear();
    expect(
      await service.finalizeCollection('org-1', {
        collection: { results: [] },
      }),
    ).toMatchObject({ attempted: 0, failed: 0 });
    expect(
      await service.finalizeCollection('org-1', {
        collection: { results: [{ status: 'failed', error: 'provider' }] },
      }),
    ).toMatchObject({ failed: 1, status: 'completed_with_errors' });
    expect(outliers.refresh).not.toHaveBeenCalled();
  });
  it('queues the immutable generic analytics graph', async () => {
    const result = await service.queueGenericSync({
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(result).toEqual({ jobId: 'job-1', workflowId: 'analytics-sync' });
    expect(workflowQueue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'analytics-sync' }),
      expect.stringContaining('analytics-sync-org-1-all-'),
      {
        attempts: 1,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      },
    );
  });

  it('registers every queued analytics workflow identity at bootstrap', () => {
    service.onModuleInit();

    expect(workflowRunner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'analytics-sync' }),
    );
    expect(workflowRunner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'analytics.organization-refresh',
      }),
    );
    expect(workflowRunner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'analytics.post-refresh.twitter',
      }),
    );
  });

  it('uses awaited bounded fan-out and registered child workflow graphs', () => {
    for (const template of ANALYTICS_SYNC_WORKFLOW_TEMPLATES.filter(
      (candidate) => candidate.id !== 'analytics-sync',
    )) {
      const forEach = template.nodes?.find(
        (node) => node.data.config.actionId === 'workflow.for-each',
      );
      expect(forEach?.data.config.parameters).toMatchObject({
        itemInputKey: 'item',
        maxConcurrency: 5,
        mode: 'await',
        failureMode: 'collect',
        baseInput: { deferOutlierRefresh: true },
      });
    }
    expect(ANALYTICS_COLLECTION_CHILD_WORKFLOWS).toHaveLength(5);
    for (const child of ANALYTICS_COLLECTION_CHILD_WORKFLOWS) {
      expect(child.version).toBe(2);
      expect(child.definition.inputVariables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'deferOutlierRefresh' }),
        ]),
      );
      expect(child.definition.nodes[0].data.inputVariableKeys).toContain(
        'deferOutlierRefresh',
      );
    }
    expect(ANALYTICS_GENERIC_CHILD_WORKFLOWS).toHaveLength(1);
  });
  describe('actor-bound refresh', () => {
    const rootRow = () =>
      hiddenExecutionRow({
        canonicalId: 'analytics.organization-refresh',
        id: 'root',
        inputValues: { initiatingActor: CHAIN_ACTOR },
        metadata: { source: 'analytics-api-refresh' },
      });
    const childRow = (item: Record<string, unknown>) =>
      hiddenExecutionRow({
        canonicalId: 'analytics.twitter.collect-item',
        id: 'child',
        inputValues: { item },
        metadata: {
          parentExecutionId: 'root',
          parentNodeId: 'collect-each-twitter',
          parentWorkflowId: 'workflow-root',
          workflowForEachIndex: 0,
        },
      });
    const twitterItem = {
      attemptKey: 'attempt-1',
      brandId: 'brand-1',
      credentialId: 'credential-1',
      externalId: 'tweet-1',
      id: 'post-1',
      organizationId: 'org',
      platform: CredentialPlatform.TWITTER,
    };

    it('persists the authenticated actor on the hidden root and runs as that user', async () => {
      await service.queueOrganizationRefresh({
        initiatingActor: { ...CHAIN_ACTOR, scopes: ['b', 'a'] },
        organizationId: 'org',
        userId: CHAIN_ACTOR.userId,
      });
      const [job, jobId] =
        workflowQueue.queueSystemWorkflow.mock.calls[0] ?? [];
      expect(job).toMatchObject({
        inputValues: {
          initiatingActor: { ...CHAIN_ACTOR, scopes: ['a', 'b'] },
        },
        source: 'analytics-api-refresh',
        userId: CHAIN_ACTOR.userId,
      });
      expect(jobId).toMatch(/^analytics-refresh-org-\d+-[0-9a-f]{64}$/);
    });

    it('leaves an actor-less refresh exactly as before', async () => {
      await service.queueOrganizationRefresh({
        organizationId: 'org',
        userId: 'user-1',
      });
      const [job, jobId] =
        workflowQueue.queueSystemWorkflow.mock.calls[0] ?? [];
      expect(job).toMatchObject({ inputValues: {}, userId: 'user-1' });
      expect(job.inputValues).not.toHaveProperty('initiatingActor');
      expect(jobId).toMatch(/^analytics-refresh-org-\d+$/);
    });

    it('keeps the post id beside the persisted actor for a post refresh', async () => {
      await service.queuePostRefresh({
        initiatingActor: CHAIN_ACTOR,
        organizationId: 'org',
        platform: CredentialPlatform.TWITTER,
        postId: 'post-1',
      });
      const [job, jobId] =
        workflowQueue.queueSystemWorkflow.mock.calls[0] ?? [];
      expect(job).toMatchObject({
        inputValues: { initiatingActor: CHAIN_ACTOR, postId: 'post-1' },
        postIds: ['post-1'],
        source: 'post-analytics-api-refresh',
        userId: CHAIN_ACTOR.userId,
      });
      expect(jobId).toMatch(/^analytics-post-refresh-post-1-\d+-[0-9a-f]{64}$/);
    });

    it.each([
      ['an actor of another organization', { organizationId: 'foreign' }, {}],
      ['an actor without a user', { userId: '' }, {}],
      ['a user that is not the actor', {}, { userId: 'someone-else' }],
    ])('refuses %s before queueing', async (_name, actor, extra) => {
      await expect(
        service.queueOrganizationRefresh({
          initiatingActor: { ...CHAIN_ACTOR, ...actor },
          organizationId: 'org',
          ...extra,
        }),
      ).rejects.toThrow('analytics_collection_actor_denied');
      expect(workflowQueue.queueSystemWorkflow).not.toHaveBeenCalled();
    });

    it('stamps the validated root actor onto discovered posts', async () => {
      const root = rootRow();
      findExecution.mockImplementation(executionLookup([root]));
      posts.findAll.mockResolvedValue({
        docs: [
          {
            brandId: 'brand-1',
            credentialId: 'credential-1',
            externalId: 'tweet-1',
            id: 'post-1',
            organizationId: 'org',
            platform: CredentialPlatform.TWITTER,
          },
        ],
      });
      const discovered = await service.discoverPosts(
        'org',
        { analyticsEnabledOnly: false, platforms: ['twitter'] },
        executionContext(root),
      );
      expect(discovered.posts[0]).toMatchObject({
        initiatingActor: CHAIN_ACTOR,
      });
    });

    it('stamps nothing for an actor-less sweep', async () => {
      posts.findAll.mockResolvedValue({
        docs: [
          {
            brandId: 'brand-1',
            externalId: 'tweet-1',
            id: 'post-1',
            organizationId: 'org',
            platform: CredentialPlatform.TWITTER,
          },
        ],
      });
      const discovered = await service.discoverPosts(
        'org',
        { analyticsEnabledOnly: false, platforms: ['twitter'] },
        context,
      );
      expect(discovered.posts[0]).not.toHaveProperty('initiatingActor');
    });

    it('denies discovery under a forged root before reading or marking posts', async () => {
      const forged = rootRow();
      forged.workflow.organizationId = 'org';
      findExecution.mockImplementation(executionLookup([forged]));
      await expect(
        service.discoverPosts(
          'org',
          { analyticsEnabledOnly: false, platforms: ['twitter'] },
          executionContext(forged),
        ),
      ).rejects.toThrow('analytics_collection_actor_denied');
      expect(posts.findAll).not.toHaveBeenCalled();
      expect(collectionState.markPending).not.toHaveBeenCalled();
    });

    it('collects under an authorization admitted from the validated chain', async () => {
      const item = { ...twitterItem, initiatingActor: CHAIN_ACTOR };
      const child = childRow(item);
      findExecution.mockImplementation(executionLookup([rootRow(), child]));
      await service.collectTwitter({ item }, executionContext(child));
      const authorization = twitter.collect.mock.calls[0]?.[1];
      expect(authorization.initiatingActor).toEqual(CHAIN_ACTOR);
      expect(brandAccess.resolve).toHaveBeenCalledOnce();
      await authorization.admit();
      expect(brandAccess.resolve).toHaveBeenCalledTimes(2);
    });

    it('refuses to collect when the item claims an actor its chain does not carry', async () => {
      const child = childRow({ ...twitterItem });
      findExecution.mockImplementation(executionLookup([rootRow(), child]));
      await expect(
        service.collectTwitter(
          { item: { ...twitterItem, initiatingActor: CHAIN_ACTOR } },
          executionContext(child),
        ),
      ).rejects.toThrow('analytics_collection_actor_denied');
      expect(twitter.collect).not.toHaveBeenCalled();
    });

    it.each([
      [
        'collectFacebook',
        providerCollection.collectFacebook,
        { context: account },
      ],
      [
        'collectThreads',
        providerCollection.collectThreads,
        { context: account },
      ],
      ['collectSocial', social.collect, account],
      ['collectYouTube', youtube.collect, account],
    ] as const)(
      '%s forwards the same authorization',
      async (method, collector, result) => {
        const item = { ...twitterItem, initiatingActor: CHAIN_ACTOR };
        const child = childRow(item);
        findExecution.mockImplementation(executionLookup([rootRow(), child]));
        collector.mockResolvedValue(result);
        await service[method]({ item }, executionContext(child));
        expect(collector.mock.calls[0]?.[1]).toMatchObject({
          initiatingActor: CHAIN_ACTOR,
        });
      },
    );
  });
});
