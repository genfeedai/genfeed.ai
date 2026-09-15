import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import { executeAwaitedForEach } from '@api/collections/workflows/system-workflow-for-each.util';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
  ANALYTICS_GENERIC_CHILD_WORKFLOWS,
  ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { getActionDefinition } from '@genfeedai/actions';
import { CredentialPlatform } from '@genfeedai/contracts';
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
  const account = {
    organizationId: 'org-1',
    brandId: 'brand-1',
    credentialId: 'credential-1',
  };
  let service: AnalyticsSyncWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    twitter.collect.mockResolvedValue(account);
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
    );
  });

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

    const result = await service.discoverPosts('org-1', {
      analyticsEnabledOnly: false,
      platforms: [CredentialPlatform.TWITTER],
    });

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

    await service.collectTwitter({ item });

    expect(twitter.collect).toHaveBeenCalledWith({
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
    });
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
        result: await service.collectTwitter({
          item,
          deferOutlierRefresh: true,
        }),
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
    await service.collectTwitter({ item });
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
      { attempts: 1, replaceTerminalJob: true },
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
});
