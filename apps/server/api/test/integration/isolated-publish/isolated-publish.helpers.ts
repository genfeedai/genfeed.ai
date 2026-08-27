import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestBrand,
  createTestCredential,
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import type { TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  createTestDatabaseHelper,
  E2ETestModule,
} from '@api-test/e2e-test.module';
import {
  CredentialPlatform,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { IPublishingProviderReadiness } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
  PostLifecycleService,
  PostPublishQueueService,
  type PublishResult,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostQueueService } from '@workers/services/scheduled-post-queue.service';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';

export const ISOLATED_PUBLISH_FAKE_EXTERNAL_PREFIX = 'fake-publish-';

export type CapturedPublishJob = Omit<PostPublishJobData, 'enqueuedAt'> & {
  enqueuedAt: string;
};

export class CapturingPostPublishQueue {
  readonly jobs: CapturedPublishJob[] = [];

  async enqueue(data: Omit<PostPublishJobData, 'enqueuedAt'>): Promise<string> {
    const job: CapturedPublishJob = {
      ...data,
      enqueuedAt: new Date().toISOString(),
    };
    this.jobs.push(job);
    return data.operationId ?? data.postId;
  }
}

export class IsolatedFakePublisher {
  readonly published: Array<{ externalId: string; postId: string }> = [];
  readonly refused: Array<{ error: string; postId: string }> = [];

  constructor(private readonly prisma: PrismaService) {}

  async publishSinglePost(post: PostEntity): Promise<PublishResult> {
    const postId = post.id.toString();
    const externalId = `${ISOLATED_PUBLISH_FAKE_EXTERNAL_PREFIX}${postId}`;
    this.published.push({ externalId, postId });
    await this.prisma.post.update({
      data: {
        externalId,
        publicationDate: new Date(),
        publishedAt: new Date(),
        targetExecutionState: TargetExecutionState.PUBLISHED,
        visibility: PostVisibility.PUBLIC,
      },
      where: { id: postId },
    });
    return {
      executionState: TargetExecutionState.PUBLISHED,
      externalId,
      platform: CredentialPlatform.TWITTER,
      success: true,
      url: `https://example.test/status/${externalId}`,
    };
  }

  async failTerminalValidation(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    const postId = post.id.toString();
    const errorMessage =
      error instanceof Error ? error.message : 'Publish validation failed';
    this.refused.push({ error: errorMessage, postId });
    await this.prisma.post.update({
      data: {
        targetExecutionState: TargetExecutionState.FAILED,
      },
      where: { id: postId },
    });
    return {
      error: errorMessage,
      executionState: TargetExecutionState.FAILED,
      externalId: null,
      platform: '',
      success: false,
      url: '',
    };
  }
}

function publishCapableReadiness(
  credentialId: string,
): IPublishingProviderReadiness {
  return {
    appReviewStatus: 'pass',
    callbackUrlStatus: 'pass',
    canSchedule: true,
    credentialId,
    diagnostics: [],
    isRetryable: false,
    permissionScopeStatus: 'pass',
    providerKey: CredentialPlatform.TWITTER,
    quotaStatus: 'unknown',
    state: 'publish_capable',
    tokenFreshness: 'pass',
  };
}

export type IsolatedPublishFixture = {
  brandId: string;
  credentialId: string;
  organizationId: string;
  userId: string;
};

export async function seedIsolatedPublishFixture(
  dbHelper: TestDatabaseHelper,
): Promise<IsolatedPublishFixture> {
  const userId = generateIdString();
  const organizationId = generateIdString();
  const brandId = generateIdString();
  const credentialId = generateIdString();

  await dbHelper.seedCollection('organizations', [
    createTestOrganization({ id: organizationId, userId }),
  ]);
  await dbHelper.seedCollection('brands', [
    createTestBrand({
      id: brandId,
      organizationId,
      userId,
    }),
  ]);
  await dbHelper.seedCollection('credentials', [
    createTestCredential({
      accessToken: 'isolated-publish-access-token',
      brandId,
      externalHandle: '@isolated-publish',
      externalId: `ext-${credentialId}`,
      id: credentialId,
      isConnected: true,
      organizationId,
      platform: 'TWITTER',
      userId,
    }),
  ]);

  return { brandId, credentialId, organizationId, userId };
}

export type IsolatedPublishHarness = {
  cronPostsService: CronPostsService;
  dbHelper: TestDatabaseHelper;
  fakePublisher: IsolatedFakePublisher;
  moduleRef: TestingModule;
  postGroupsService: PostGroupsService;
  prisma: PrismaService;
  queue: CapturingPostPublishQueue;
};

export async function createIsolatedPublishHarness(): Promise<IsolatedPublishHarness> {
  assertIsolatedDatabaseUrl();

  const queue = new CapturingPostPublishQueue();
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const moduleConfig = await E2ETestModule.forRoot({
    controllers: [],
    providers: [
      PostGroupContractService,
      PostGroupPersistenceService,
      PostGroupReadinessService,
      PostGroupsService,
      PostLifecycleService,
      PublishApprovalsService,
      AgentArtifactReferenceService,
      CronPostsService,
      ScheduledPostExecutionGuardService,
      ScheduledPostQueueService,
      {
        provide: CredentialPublishingReadinessService,
        useValue: {
          resolveForCredentials: async (
            _tx: unknown,
            _organizationId: string,
            credentialIds: readonly string[],
          ) => {
            const readiness = new Map<string, IPublishingProviderReadiness>();
            for (const credentialId of credentialIds) {
              readiness.set(
                credentialId,
                publishCapableReadiness(credentialId),
              );
            }
            return readiness;
          },
        },
      },
      {
        provide: LoggerService,
        useValue: logger,
      },
      {
        provide: SERVER_TOKENS.logger,
        useValue: logger,
      },
      {
        provide: SERVER_TOKENS.prisma,
        useExisting: PrismaService,
      },
      {
        provide: PostPublishQueueService,
        useValue: queue,
      },
      {
        provide: ScheduledPostDeliveryService,
        useFactory: (prisma: PrismaService) =>
          new IsolatedFakePublisher(prisma),
        inject: [PrismaService],
      },
      {
        provide: ActivitiesService,
        useValue: { create: vi.fn().mockResolvedValue(undefined) },
      },
      {
        provide: AgentScopeContextService,
        useValue: {
          assertConsequentialBoundary: vi.fn().mockResolvedValue(undefined),
          assertResourceBrand: vi.fn(),
        },
      },
      {
        provide: PostRepeatSchedulerService,
        useValue: {
          materializeRecurrence: vi.fn().mockResolvedValue(undefined),
          scheduleNextRepeat: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: PostsService,
        useFactory: (prisma: PrismaService) => ({
          findAll: async (query: { where?: Prisma.PostWhereInput }) => {
            const row = await prisma.post.findFirst({
              include: {
                publishApproval: {
                  select: {
                    artifactVersionPinId: true,
                    id: true,
                    operationId: true,
                  },
                },
              },
              where: query.where,
            });
            return {
              docs: row ? [new PostEntity(row)] : [],
              total: row ? 1 : 0,
            };
          },
        }),
        inject: [PrismaService],
      },
    ],
    useMockGuards: false,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [moduleConfig],
  }).compile();

  const fakePublisher = moduleRef.get(ScheduledPostDeliveryService);
  if (!(fakePublisher instanceof IsolatedFakePublisher)) {
    throw new Error(
      'IsolatedFakePublisher was not bound to the worker delivery token',
    );
  }

  return {
    cronPostsService: moduleRef.get(CronPostsService),
    dbHelper: createTestDatabaseHelper(moduleRef),
    fakePublisher,
    moduleRef,
    postGroupsService: moduleRef.get(PostGroupsService),
    prisma: moduleRef.get(PrismaService),
    queue,
  };
}

export async function createDraftRelease(
  harness: IsolatedPublishHarness,
  fixture: IsolatedPublishFixture,
) {
  return harness.postGroupsService.create(
    fixture.organizationId,
    fixture.userId,
    {
      baseContent: 'Isolated publish path proof',
      brandId: fixture.brandId,
      status: ReleaseStatus.DRAFT,
      targets: [
        {
          credentialId: fixture.credentialId,
          platform: CredentialPlatform.TWITTER,
          settings: { replyPolicy: 'everyone' },
        },
      ],
      timezone: 'UTC',
      title: 'Isolated publish',
    },
  );
}

export function requireReleaseTargetId(release: {
  targets?: Array<{ id: string }> | null;
}): string {
  const targetId = release.targets?.[0]?.id;
  if (!targetId) {
    throw new Error(
      'Isolated publish fixture did not persist a channel target',
    );
  }
  return targetId;
}
