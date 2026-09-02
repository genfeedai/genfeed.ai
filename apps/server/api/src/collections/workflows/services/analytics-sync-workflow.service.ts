import type {
  SocialAnalyticsCollectionInput,
  TwitterAnalyticsCollectionInput,
  YouTubeAnalyticsCollectionInput,
} from '@api/analytics/analytics-collection-action.types';
import { AnalyticsProviderCollectionService } from '@api/analytics/services/analytics-provider-collection.service';
import { AnalyticsSocialCollectionService } from '@api/analytics/services/analytics-social-collection.service';
import { AnalyticsTwitterCollectionService } from '@api/analytics/services/analytics-twitter-collection.service';
import { AnalyticsYouTubeCollectionService } from '@api/analytics/services/analytics-youtube-collection.service';
import { PostAnalyticsCollectionStateService } from '@api/analytics/services/post-analytics-collection-state.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS,
  ANALYTICS_SYNC_ACTION_IDS,
  ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
  type AnalyticsSyncWorkflowTemplate,
} from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import type { WorkflowDefinitionInput } from '@api/collections/workflows/workflow-version-definition';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { scopedWhere } from '@api/index';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type AnalyticsPost = PostEntity & {
  brandId: string;
  credentialId?: string | null;
  externalId: string;
  organizationId: string;
  platform: CredentialPlatform;
};

type AnalyticsDiscovery = {
  attemptKey: string;
  posts: Array<{
    brandId: string;
    attemptKey: string;
    credentialId?: string;
    externalId: string;
    id: string;
    organizationId: string;
    platform: CredentialPlatform;
  }>;
  requested: number;
  skipped: number;
};

export type AnalyticsCollectionActionResult = {
  attempted: number;
  batches: number;
};

export type QueuedAnalyticsWorkflowResult = {
  jobId: string;
  workflowId: string;
};

const DISCOVERY_LIMIT = 500;
const HOUR_MS = 60 * 60 * 1000;
const ANALYTICS_POST_REFRESH_PLATFORMS = [
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.MASTODON,
  CredentialPlatform.PINTEREST,
  CredentialPlatform.THREADS,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.TWITTER,
  CredentialPlatform.YOUTUBE,
] as const;

export function analyticsPostRefreshWorkflowId(
  platform: CredentialPlatform,
): string {
  return `analytics.post-refresh.${platform}`;
}

@Injectable()
export class AnalyticsSyncWorkflowService implements OnModuleInit {
  constructor(
    private readonly postsService: PostsService,
    private readonly collectionState: PostAnalyticsCollectionStateService,
    private readonly providerCollection: AnalyticsProviderCollectionService,
    private readonly socialCollection: AnalyticsSocialCollectionService,
    private readonly twitterCollection: AnalyticsTwitterCollectionService,
    private readonly youtubeCollection: AnalyticsYouTubeCollectionService,
    private readonly analyticsSync: AnalyticsSyncService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly workflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.workflowRunner.registerWorkflow(this.definition('analytics-sync'));
    this.workflowRunner.registerWorkflow(this.organizationRefreshDefinition());
    for (const platform of ANALYTICS_POST_REFRESH_PLATFORMS) {
      this.workflowRunner.registerWorkflow(
        this.postRefreshDefinition(platform),
      );
    }
  }

  async queueGenericSync(input: {
    brandId?: string;
    organizationId: string;
    since?: string;
    userId?: string;
  }): Promise<QueuedAnalyticsWorkflowResult> {
    const definition = this.definition('analytics-sync');
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          ...(input.brandId ? { brandId: input.brandId } : {}),
          ...(input.since ? { since: input.since } : {}),
        },
        organizationId: input.organizationId,
        source: 'analytics-api',
        userId: input.userId,
      },
      `analytics-sync-${input.organizationId}-${input.brandId ?? 'all'}-${this.windowKey(5 * 60 * 1000)}`,
      { attempts: 1, replaceTerminalJob: true },
    );
    return { jobId, workflowId: definition.canonicalId };
  }

  async queueOrganizationRefresh(input: {
    organizationId: string;
    userId?: string;
  }): Promise<QueuedAnalyticsWorkflowResult> {
    const definition = this.organizationRefreshDefinition();
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {},
        organizationId: input.organizationId,
        source: 'analytics-api-refresh',
        userId: input.userId,
      },
      `analytics-refresh-${input.organizationId}-${this.windowKey(HOUR_MS)}`,
      { attempts: 1 },
    );
    return { jobId, workflowId: definition.canonicalId };
  }

  async queuePostRefresh(input: {
    organizationId: string;
    platform: CredentialPlatform;
    postId: string;
    userId?: string;
  }): Promise<QueuedAnalyticsWorkflowResult> {
    const canonicalId = analyticsPostRefreshWorkflowId(input.platform);
    const jobId = await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: canonicalId,
        canonicalId,
        inputValues: { postId: input.postId },
        organizationId: input.organizationId,
        postIds: [input.postId],
        source: 'post-analytics-api-refresh',
        userId: input.userId,
      },
      `analytics-post-refresh-${input.postId}-${this.windowKey(HOUR_MS)}`,
      { attempts: 1 },
    );
    return { jobId, workflowId: canonicalId };
  }

  async discoverPosts(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<AnalyticsDiscovery> {
    const platforms = this.readPlatforms(input.platforms);
    const analyticsEnabledOnly = input.analyticsEnabledOnly !== false;
    const postId = this.readOptionalString(input.postId);
    const where = scopedWhere(organizationId, {
      externalId: { not: null },
      platform: platforms.length === 1 ? platforms[0] : { in: platforms },
      ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      ...(analyticsEnabledOnly ? { isAnalyticsEnabled: { not: false } } : {}),
      ...(postId
        ? { id: postId }
        : { analyticsNextCollectAt: { lte: new Date() } }),
    });
    const result = await this.postsService.findAll(
      { orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }], where },
      {
        customLabels,
        limit: DISCOVERY_LIMIT,
        page: 1,
        pagination: true,
      },
      false,
    );
    const attemptKey = `analytics:${organizationId}:${this.windowKey(HOUR_MS)}`;
    let skipped = 0;
    const posts = (result.docs as unknown as AnalyticsPost[]).flatMap(
      (post) => {
        const id = this.readOptionalString(post.id);
        const brandId = this.readOptionalString(post.brandId);
        const externalId = this.readOptionalString(post.externalId);
        if (!id || !brandId || !externalId) {
          skipped++;
          return [];
        }
        const credentialId = this.readOptionalString(post.credentialId);
        return [
          {
            attemptKey,
            brandId,
            ...(credentialId ? { credentialId } : {}),
            externalId,
            id,
            organizationId,
            platform: post.platform,
          },
        ];
      },
    );

    if (posts.length > 0) {
      await this.collectionState.markPending({
        attemptKey,
        requestedAt: new Date(),
        targets: posts.map(({ brandId, id, organizationId, platform }) => ({
          brandId,
          id,
          organizationId,
          platform,
        })),
      });
    }

    return { attemptKey, posts, requested: posts.length, skipped };
  }

  async collectFacebook(
    input: Record<string, unknown>,
  ): Promise<AnalyticsCollectionActionResult> {
    const post = this.readAnalyticsItem(input.item);
    await this.providerCollection.collectFacebook(this.socialJobData(post));
    return { attempted: 1, batches: 1 };
  }

  async collectSocial(
    input: Record<string, unknown>,
  ): Promise<AnalyticsCollectionActionResult> {
    const post = this.readAnalyticsItem(input.item);
    await this.socialCollection.collect(this.socialJobData(post));
    return { attempted: 1, batches: 1 };
  }

  async collectThreads(
    input: Record<string, unknown>,
  ): Promise<AnalyticsCollectionActionResult> {
    const post = this.readAnalyticsItem(input.item);
    await this.providerCollection.collectThreads(this.socialJobData(post));
    return { attempted: 1, batches: 1 };
  }

  async collectTwitter(
    input: Record<string, unknown>,
  ): Promise<AnalyticsCollectionActionResult> {
    const post = this.readAnalyticsItem(input.item);
    if (!post.credentialId) {
      throw new Error(`Analytics post ${post.id} requires a credential`);
    }
    const data: TwitterAnalyticsCollectionInput = {
      attemptKey: post.attemptKey,
      credentialId: post.credentialId,
      posts: [this.collectionPost(post)],
    };
    await this.twitterCollection.collect(data);
    return { attempted: 1, batches: 1 };
  }

  async collectYouTube(
    input: Record<string, unknown>,
  ): Promise<AnalyticsCollectionActionResult> {
    const post = this.readAnalyticsItem(input.item);
    const data: YouTubeAnalyticsCollectionInput = {
      attemptKey: post.attemptKey,
      brandId: post.brandId,
      credentialId: post.credentialId,
      organizationId: post.organizationId,
      posts: [this.collectionPost(post)],
    };
    await this.youtubeCollection.collect(data);
    return { attempted: 1, batches: 1 };
  }

  finalizeCollection(input: Record<string, unknown>): {
    attempted: number;
    batches: number;
    status: 'completed';
  } {
    const collection = this.readRecord(input.collection);
    const results = this.readArray(collection.results);
    return {
      attempted:
        results.length > 0
          ? results.length
          : this.readNumber(collection.attempted),
      batches:
        results.length > 0
          ? results.length
          : this.readNumber(collection.batches),
      status: 'completed',
    };
  }

  async resolveGenericWindow(
    organizationId: string,
    input: Record<string, unknown>,
  ): Promise<{ brandId?: string; organizationId: string; since?: string }> {
    const brandId = this.readOptionalString(input.brandId);
    const explicitSince = this.readOptionalString(input.since);
    const lastSync = explicitSince
      ? new Date(explicitSince)
      : await this.analyticsSync.getLastSyncDate(organizationId, brandId);
    return {
      ...(brandId ? { brandId } : {}),
      organizationId,
      ...(lastSync ? { since: lastSync.toISOString() } : {}),
    };
  }

  async discoverGeneric(
    organizationId: string,
    input: Record<string, unknown>,
  ) {
    const window = this.readRecord(input.window);
    const brandId = this.readOptionalString(window.brandId);
    const since = this.readOptionalString(window.since);
    return this.analyticsSync.discoverItems({
      ...(brandId ? { brandId } : {}),
      organizationId,
      ...(since ? { since: new Date(since) } : {}),
    });
  }

  persistGeneric(organizationId: string, input: Record<string, unknown>) {
    return this.analyticsSync.persistItem(organizationId, input.item);
  }

  syncGenericMemory(organizationId: string, input: Record<string, unknown>) {
    return this.analyticsSync.syncItemMemory(organizationId, input.persisted);
  }

  detectGenericAlerts(organizationId: string, input: Record<string, unknown>) {
    return this.analyticsSync.detectItemAlerts(organizationId, input.persisted);
  }

  private definition(canonicalId: string): SystemWorkflowGraphDefinition {
    const template = ANALYTICS_SYNC_WORKFLOW_TEMPLATES.find(
      (candidate) => candidate.id === canonicalId,
    );
    if (!template?.nodes || template.nodes.length === 0) {
      throw new Error(`Unknown analytics workflow definition: ${canonicalId}`);
    }
    return this.templateDefinition(template, template.nodes.at(-1)?.id ?? '');
  }

  private organizationRefreshDefinition(): SystemWorkflowGraphDefinition {
    const branches = [
      {
        childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.FACEBOOK,
        id: 'facebook',
        platforms: [CredentialPlatform.FACEBOOK],
      },
      {
        childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.SOCIAL,
        id: 'social',
        platforms: [
          CredentialPlatform.INSTAGRAM,
          CredentialPlatform.LINKEDIN,
          CredentialPlatform.MASTODON,
          CredentialPlatform.PINTEREST,
          CredentialPlatform.TIKTOK,
        ],
      },
      {
        childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.THREADS,
        id: 'threads',
        platforms: [CredentialPlatform.THREADS],
      },
      {
        childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.TWITTER,
        id: 'twitter',
        platforms: [CredentialPlatform.TWITTER],
      },
      {
        childWorkflowId: ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.YOUTUBE,
        id: 'youtube',
        platforms: [CredentialPlatform.YOUTUBE],
      },
    ] as const;
    const nodes = branches.flatMap((branch, index) => [
      createGenfeedActionNode({
        actionId: ANALYTICS_SYNC_ACTION_IDS.DISCOVER_POSTS,
        id: `discover-${branch.id}`,
        position: { x: index * 260, y: 0 },
        parameters: {
          analyticsEnabledOnly: !['twitter', 'youtube'].includes(branch.id),
          platforms: branch.platforms,
        },
      }),
      createGenfeedActionNode({
        actionId: 'workflow.for-each',
        id: `collect-each-${branch.id}`,
        parameters: {
          childWorkflowId: branch.childWorkflowId,
          interItemDelayMs: 100,
          itemInputKey: 'item',
          maxConcurrency: 5,
          mode: 'scheduled',
        },
        position: { x: index * 260, y: 220 },
      }),
      createGenfeedActionNode({
        actionId: ANALYTICS_SYNC_ACTION_IDS.FINALIZE_COLLECTION,
        id: `finalize-${branch.id}`,
        position: { x: index * 260, y: 440 },
      }),
    ]);
    const edges = branches.flatMap((branch) => [
      {
        id: `${branch.id}-discover-to-fanout`,
        source: `discover-${branch.id}`,
        sourceHandle: 'posts',
        target: `collect-each-${branch.id}`,
        targetHandle: 'items',
      },
      {
        id: `${branch.id}-fanout-to-finalize`,
        source: `collect-each-${branch.id}`,
        target: `finalize-${branch.id}`,
        targetHandle: 'collection',
      },
    ]);
    return {
      canonicalId: 'analytics.organization-refresh',
      definition: { edges, inputVariables: [], nodes },
      description:
        'Collects due analytics through independent provider action branches.',
      label: 'Organization Analytics Refresh',
      resultNodeId: 'finalize-youtube',
      version: 1,
    };
  }

  private postRefreshDefinition(
    platform: CredentialPlatform,
  ): SystemWorkflowGraphDefinition {
    const childWorkflowId = this.collectionWorkflowForPlatform(platform);
    return {
      canonicalId: analyticsPostRefreshWorkflowId(platform),
      definition: {
        edges: [
          {
            id: 'discover-to-fanout',
            source: 'discover-post',
            sourceHandle: 'posts',
            target: 'collect-post',
            targetHandle: 'items',
          },
          {
            id: 'collect-to-finalize',
            source: 'collect-post',
            target: 'finalize-post',
            targetHandle: 'collection',
          },
        ],
        inputVariables: [
          {
            key: 'postId',
            label: 'Post ID',
            required: true,
            type: 'string',
          },
        ],
        nodes: [
          createGenfeedActionNode({
            actionId: ANALYTICS_SYNC_ACTION_IDS.DISCOVER_POSTS,
            id: 'discover-post',
            inputVariableKeys: ['postId'],
            parameters: {
              analyticsEnabledOnly: false,
              platforms: [platform],
            },
            position: { x: 0, y: 0 },
          }),
          createGenfeedActionNode({
            actionId: 'workflow.for-each',
            id: 'collect-post',
            parameters: {
              childWorkflowId,
              itemInputKey: 'item',
              maxConcurrency: 1,
              mode: 'scheduled',
            },
            position: { x: 0, y: 220 },
          }),
          createGenfeedActionNode({
            actionId: ANALYTICS_SYNC_ACTION_IDS.FINALIZE_COLLECTION,
            id: 'finalize-post',
            position: { x: 0, y: 440 },
          }),
        ],
      },
      description:
        'Collects fresh analytics for one authorized published post.',
      label: 'Post Analytics Refresh',
      resultNodeId: 'finalize-post',
      version: 1,
    };
  }

  private collectionWorkflowForPlatform(
    platform: CredentialPlatform,
  ): (typeof ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS)[keyof typeof ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS] {
    switch (platform) {
      case CredentialPlatform.FACEBOOK:
        return ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.FACEBOOK;
      case CredentialPlatform.THREADS:
        return ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.THREADS;
      case CredentialPlatform.TWITTER:
        return ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.TWITTER;
      case CredentialPlatform.YOUTUBE:
        return ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.YOUTUBE;
      case CredentialPlatform.INSTAGRAM:
      case CredentialPlatform.LINKEDIN:
      case CredentialPlatform.MASTODON:
      case CredentialPlatform.PINTEREST:
      case CredentialPlatform.TIKTOK:
        return ANALYTICS_COLLECTION_CHILD_WORKFLOW_IDS.SOCIAL;
      default:
        throw new Error(
          `Analytics refresh does not support platform ${platform}`,
        );
    }
  }

  private templateDefinition(
    template: AnalyticsSyncWorkflowTemplate,
    resultNodeId: string,
  ): SystemWorkflowGraphDefinition {
    return {
      canonicalId: template.id,
      changeSummary: template.changeSummary,
      definition: {
        edges: template.edges ?? [],
        inputVariables:
          (template.inputVariables as WorkflowDefinitionInput['inputVariables']) ??
          [],
        nodes: template.nodes ?? [],
      },
      description: template.description,
      label: template.name,
      resultNodeId,
      version: template.version,
    };
  }

  private readPlatforms(value: unknown): CredentialPlatform[] {
    if (!Array.isArray(value)) {
      throw new Error('Analytics discovery requires platforms');
    }
    const allowed = new Set(Object.values(CredentialPlatform));
    const platforms = value.filter(
      (item): item is CredentialPlatform =>
        typeof item === 'string' && allowed.has(item as CredentialPlatform),
    );
    if (platforms.length === 0) {
      throw new Error('Analytics discovery received no supported platforms');
    }
    return platforms;
  }

  private readAnalyticsItem(
    value: unknown,
  ): AnalyticsDiscovery['posts'][number] {
    const item = this.readRecord(value);
    const platform = this.readPlatforms([item.platform])[0];
    if (!platform) {
      throw new Error('Analytics collection item requires platform');
    }
    return {
      attemptKey: this.requiredString(item.attemptKey, 'attemptKey'),
      brandId: this.requiredString(item.brandId, 'brandId'),
      ...(this.readOptionalString(item.credentialId)
        ? { credentialId: this.readOptionalString(item.credentialId) }
        : {}),
      externalId: this.requiredString(item.externalId, 'externalId'),
      id: this.requiredString(item.id, 'id'),
      organizationId: this.requiredString(
        item.organizationId,
        'organizationId',
      ),
      platform,
    };
  }

  private socialJobData(
    post: AnalyticsDiscovery['posts'][number],
  ): SocialAnalyticsCollectionInput {
    return {
      attemptKey: post.attemptKey,
      posts: [
        {
          brandId: post.brandId,
          ...(post.credentialId ? { credentialId: post.credentialId } : {}),
          externalId: post.externalId,
          id: post.id,
          organizationId: post.organizationId,
          platform: post.platform,
        },
      ],
    };
  }

  private collectionPost(post: AnalyticsDiscovery['posts'][number]) {
    return {
      brandId: post.brandId,
      externalId: post.externalId,
      id: post.id,
      organizationId: post.organizationId,
    };
  }

  private readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private requiredString(value: unknown, field: string): string {
    const resolved = this.readOptionalString(value);
    if (!resolved) {
      throw new Error(`Analytics workflow requires ${field}`);
    }
    return resolved;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private readNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private windowKey(windowMs: number): number {
    return Math.floor(Date.now() / windowMs);
  }
}
