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
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  Platform,
  TargetExecutionState,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService as LibsPrismaService } from '@libs/prisma/prisma.service';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

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
  const libsPrisma = db as unknown as LibsPrismaService;
  const scheduler = new SchedulerPublishStateService(
    libsPrisma,
    logger,
    new PostLifecycleService(db, silentLogger),
  );
  const anything = new Proxy({}, { get: () => async () => undefined }) as never;
  const actions = new Map<string, RegisteredAction>();
  const service = new ScheduledPostDeliveryService(
    logger,
    new ScheduledPostFailureService(logger, anything, scheduler),
    {
      findOne: async (query: { id: string; organizationId?: string }) =>
        db.credential.findFirst({
          where: scopedWhere(world.organizationId, { id: query.id }),
        }),
    } as never,
    {
      findOne: async (query: { id: string }) =>
        db.organization.findFirst({
          where: { id: query.id, isDeleted: false },
        }),
    } as never,
    {
      checkQuota: async () => ({
        allowed: true,
        currentCount: 0,
        dailyLimit: 100,
      }),
    } as never,
    {
      getPublisher: () => ({
        publish: async (context: PublishContext) => {
          published.push(context);
          return publisher.answer(context);
        },
      }),
    } as never,
    {
      registerAction: (id: string, action: RegisteredAction) => {
        actions.set(id, action);
      },
    } as never,
    {
      emitLegacyPostFailed: async () => undefined,
      emitLegacyPostPublished: async () => undefined,
    } as never,
    scheduler,
    { schedulePostWatch: async () => ({ scheduled: 0 }) } as never,
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
    } as never,
    libsPrisma,
    { evaluatePublishReadiness: async () => [] } as never,
    anything,
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
    published,
    publisher,
  };
}
