import { AgentArtifactReferenceService } from '@api/agent-artifacts/agent-artifact-reference.service';
import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import { runWithRequestPrincipal } from '@api/authorization/brand-access/request-principal.context';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import { hiddenFixtureDefinition } from '@api/collections/outliers/services/breakout-acceptance.collection.fixture';
import type { ExecutionHarness } from '@api/collections/outliers/services/breakout-acceptance.execution.fixture';
import {
  type AcceptanceUser,
  type AcceptanceWorld,
  must,
  silentLogger,
} from '@api/collections/outliers/services/breakout-acceptance.world.fixture';
import { SCHEDULED_POST_ACTION_IDS } from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { ensureHiddenSystemWorkflowMirror } from '@api/collections/workflows/system-workflow-mirror.util';
import type { PublishContext, PublishResult } from '@api/index';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import { PublishApprovalsService } from '@api/publish-approvals/publish-approvals.service';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  Platform,
  TargetExecutionState,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type {
  MediaProbe,
  MediaReadinessKind,
} from '@genfeedai/contracts/api-types/contracts';
import type { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService as LibsPrismaService } from '@libs/prisma/prisma.service';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

type Deps = ConstructorParameters<typeof ScheduledPostDeliveryService>;

/** The request principal of an authenticated user or key, as the request interceptor binds it. */
export function principalOf(
  world: Pick<AcceptanceWorld, 'organizationId'>,
  user: Pick<AcceptanceUser, 'id'>,
  key?: { actor: WorkflowInitiatingActor },
): WorkflowInitiatingActor {
  return (
    key?.actor ?? {
      isApiKey: false,
      organizationId: world.organizationId,
      scopes: [],
      userId: user.id,
    }
  );
}

/** Schedules a draft the way a request does: through PostsService, under the request principal. */
export function scheduleDraft(
  harness: ExecutionHarness,
  world: AcceptanceWorld,
  postId: string,
  principal: BrandAccessActor | undefined,
  scheduledDate = new Date(Date.now() + 60 * 60_000),
) {
  return runWithRequestPrincipal(principal, () =>
    harness.posts.patch(
      postId,
      {
        organizationId: world.organizationId,
        scheduledDate,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        userId: principal?.userId ?? world.owner.id,
      },
      [],
    ),
  );
}

type RegisteredAction = (request: {
  context: Record<string, unknown>;
  input: Record<string, unknown>;
  provenance: Record<string, unknown>;
}) => Promise<PublishResult>;

export type DeliveryHarness = {
  /** One scheduled-post delivery: approval claim, the real worker delivery action, completion. */
  deliver: (postId: string) => Promise<{
    executionId: string;
    result: PublishResult;
  }>;
  /** What the fake X publisher was asked to publish. */
  published: PublishContext[];
  /**
   * The files service probe behind the real media readiness gate. By default every asset probes
   * as a clean, platform-ready file; a scenario can make the probe fail until the asset is ready.
   */
  files: {
    probe: (url: string, kind: MediaReadinessKind) => Promise<MediaProbe>;
  };
  /** How the fake X publisher answers the next publish; defaults to an accepted publication. */
  publisher: {
    answer: (context: PublishContext) => Promise<PublishResult>;
  };
};

/**
 * The worker's real ScheduledPostDeliveryService over the real database, with a fake X
 * publisher as the only provider. Readiness, quota and media gates are allowed through; the
 * breakout dispatch fence, the state machine, the attempt receipts and the approval lifecycle
 * are production code.
 */
export function buildDeliveryHarness(
  db: PrismaClient<'query'>,
  prisma: PrismaService,
  logger: LoggerService,
  world: AcceptanceWorld,
): DeliveryHarness {
  const published: PublishContext[] = [];
  const publisher: DeliveryHarness['publisher'] = {
    answer: async () => ({
      executionState: TargetExecutionState.PUBLISHED,
      externalId: `x-published-${published.length}-${world.suffix}`,
      platform: Platform.TWITTER,
      success: true,
      url: 'https://x.example/status',
    }),
  };
  const files: DeliveryHarness['files'] = {
    probe: async (_url, kind) => ({
      audioCodec: kind === 'video' ? 'aac' : null,
      container: kind === 'video' ? 'mp4' : 'png',
      durationSeconds: kind === 'video' ? 10 : null,
      frameRate: kind === 'video' ? 30 : null,
      height: kind === 'video' ? 720 : 1024,
      kind,
      probedAt: new Date().toISOString(),
      sizeBytes: 1_000_000,
      videoCodec: kind === 'video' ? 'h264' : null,
      width: kind === 'video' ? 1280 : 1024,
    }),
  };
  const libsPrisma = db as unknown as LibsPrismaService;
  const scheduler = new SchedulerPublishStateService(
    libsPrisma,
    logger,
    new PostLifecycleService(db, silentLogger),
  );
  const anything: unknown = new Proxy({}, { get: () => async () => undefined });
  const actions = new Map<string, RegisteredAction>();
  const service = new ScheduledPostDeliveryService(
    logger,
    new ScheduledPostFailureService(
      logger,
      anything as ConstructorParameters<typeof ScheduledPostFailureService>[1],
      scheduler,
    ),
    {
      findOne: async (query: { id: string; organizationId?: string }) =>
        db.credential.findFirst({
          where: scopedWhere(world.organizationId, { id: query.id }),
        }),
    } as unknown as Deps[2],
    {
      findOne: async (query: { id: string }) =>
        db.organization.findFirst({
          where: { id: query.id, isDeleted: false },
        }),
    } as unknown as Deps[3],
    {
      checkQuota: async () => ({
        allowed: true,
        currentCount: 0,
        dailyLimit: 100,
      }),
    } as unknown as Deps[4],
    {
      getPublisher: () => ({
        publish: async (context: PublishContext) => {
          published.push(context);
          return publisher.answer(context);
        },
      }),
    } as unknown as Deps[5],
    {
      registerAction: (id: string, action: RegisteredAction) => {
        actions.set(id, action);
      },
    } as unknown as Deps[6],
    {
      emitLegacyPostFailed: async () => undefined,
      emitLegacyPostPublished: async () => undefined,
    } as unknown as Deps[7],
    scheduler,
    { schedulePostWatch: async () => ({ scheduled: 0 }) } as unknown as Deps[9],
    {
      resolveForCredentials: async (
        _client: unknown,
        _organizationId: string,
        credentialIds: readonly string[],
      ) =>
        new Map(
          credentialIds.map((credentialId) => [
            credentialId,
            {
              canSchedule: true,
              credentialId,
              diagnostics: [],
              isRetryable: false,
              state: 'ready',
            },
          ]),
        ),
    } as unknown as Deps[10],
    libsPrisma,
    new MediaReadinessService(
      libsPrisma,
      {
        probeMediaFromUrl: (url: string, kind: MediaReadinessKind) =>
          files.probe(url, kind),
      } as unknown as ConstructorParameters<typeof MediaReadinessService>[1],
      logger,
    ) as unknown as Deps[12],
    anything as Deps[13],
  );
  service.onModuleInit();
  const approvals = new PublishApprovalsService(
    db,
    new AgentArtifactReferenceService(db, silentLogger),
    silentLogger,
  );

  async function newExecution() {
    const definition = hiddenFixtureDefinition('scheduled-post.fixture');
    const workflow = await ensureHiddenSystemWorkflowMirror(prisma, definition);
    const version = must(workflow.currentVersion, 'the workflow version');
    return db.workflowExecution.create({
      data: {
        organizationId: world.organizationId,
        result: { inputValues: {}, metadata: {}, nodeResults: [], progress: 0 },
        status: WorkflowExecutionStatus.RUNNING,
        userId: world.owner.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
      },
    });
  }

  return {
    deliver: async (postId) => {
      const execution = await newExecution();
      const post = must(
        await db.post.findFirst({
          where: scopedWhere(world.organizationId, { id: postId }),
        }),
        'the scheduled post',
      );
      const approval = must(
        await db.publishApproval.findFirst({
          where: {
            id: must(post.publishApprovalId, 'the publish approval'),
            organizationId: world.organizationId,
          },
        }),
        'the approval row',
      );
      if (!['queued', 'executing', 'published'].includes(approval.status))
        await approvals.markQueued(
          approval.id,
          world.organizationId,
          world.owner.id,
        );
      const claim = await approvals.claimForExecution({
        approvalId: approval.id,
        operationId: approval.operationId,
        organizationId: world.organizationId,
        postId,
        versionPinId: approval.artifactVersionPinId,
      });
      // Delivery guards its PUBLISHED write with the execution holding the lease.
      await db.post.updateMany({
        data: { workflowExecutionId: execution.id },
        where: scopedWhere(world.organizationId, { id: postId }),
      });
      const action = must(
        actions.get(SCHEDULED_POST_ACTION_IDS.DELIVER),
        'the registered delivery action',
      );
      const result = await action({
        context: {},
        input: {
          claim: {
            executionStartedAt: claim.executionStartedAt,
            isAlreadyPublished: claim.isAlreadyPublished,
          },
          request: {
            organizationId: world.organizationId,
            postId,
            source: 'scheduled_sweep',
          },
        },
        provenance: { executionId: execution.id },
      });
      if (claim.executionStartedAt)
        await approvals.completeExecution({
          approvalId: approval.id,
          ...(result.error ? { error: result.error } : {}),
          executionStartedAt: claim.executionStartedAt,
          isSuccessful: result.success,
          operationId: approval.operationId,
          organizationId: world.organizationId,
          versionPinId: approval.artifactVersionPinId,
        });
      return { executionId: execution.id, result };
    },
    files,
    published,
    publisher,
  };
}
