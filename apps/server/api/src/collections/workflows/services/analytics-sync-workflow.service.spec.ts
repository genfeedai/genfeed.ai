import { AnalyticsSyncWorkflowService } from '@api/collections/workflows/services/analytics-sync-workflow.service';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOWS,
  ANALYTICS_GENERIC_CHILD_WORKFLOWS,
  ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
} from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CredentialPlatform } from '@genfeedai/enums';
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
  let service: AnalyticsSyncWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('uses scheduled bounded fan-out and registered child workflow graphs', () => {
    for (const template of ANALYTICS_SYNC_WORKFLOW_TEMPLATES.filter(
      (candidate) => candidate.id !== 'analytics-sync',
    )) {
      const forEach = template.nodes?.find(
        (node) => node.data.config.actionId === 'workflow.for-each',
      );
      expect(forEach?.data.config.parameters).toMatchObject({
        itemInputKey: 'item',
        maxConcurrency: 5,
        mode: 'scheduled',
      });
    }
    expect(ANALYTICS_COLLECTION_CHILD_WORKFLOWS).toHaveLength(5);
    expect(ANALYTICS_GENERIC_CHILD_WORKFLOWS).toHaveLength(1);
  });
});
