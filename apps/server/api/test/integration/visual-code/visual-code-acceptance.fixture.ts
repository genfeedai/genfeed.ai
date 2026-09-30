import { deepStrictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { type AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { VisualProjectsController } from '@api/collections/visual-projects/controllers/visual-projects.controller';
import { VisualProjectAssetsService } from '@api/collections/visual-projects/services/visual-project-assets.service';
import { VisualProjectAuthoringService } from '@api/collections/visual-projects/services/visual-project-authoring.service';
import { VisualProjectAuthorizationService } from '@api/collections/visual-projects/services/visual-project-authorization.service';
import { VisualProjectBillingService } from '@api/collections/visual-projects/services/visual-project-billing.service';
import { VisualProjectDispatchService } from '@api/collections/visual-projects/services/visual-project-dispatch.service';
import { VisualProjectRendererClientService } from '@api/collections/visual-projects/services/visual-project-renderer-client.service';
import { VisualProjectWorkflowService } from '@api/collections/visual-projects/services/visual-project-workflow.service';
import { VisualProjectsService } from '@api/collections/visual-projects/services/visual-projects.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import {
  type WorkflowExecutionJobData,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowNodeClaimService } from '@api/collections/workflows/services/workflow-node-claim.service';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  isProtectedSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  WORKFLOW_ENGINE_ADAPTER,
  WORKFLOW_EXECUTOR,
} from '@api/collections/workflows/workflows.tokens';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentModelAccessService } from '@api/services/agent-orchestrator/agent-model-access.service';
import type { ILlmCompletionRoute } from '@api/services/integrations/llm/dto/llm-completion-route.dto';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { WebhookDispatchService } from '@api/services/webhook-client/webhook-dispatch.service';
import { WorkflowEventWebhookService } from '@api/services/webhook-client/workflow-event-webhook.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertIsolatedDatabaseUrl } from '@api-test/../scripts/assert-isolated-db-url';
import {
  createTestBrand,
  createTestMember,
  createTestOrganization,
  createTestOrganizationSetting,
  createTestUser,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import { E2ETestModule } from '@api-test/e2e-test.module';
import {
  IngredientCategory,
  IngredientStatus,
  MemberRole,
  MetadataExtension,
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  SubscriptionPlan,
} from '@genfeedai/contracts';
import {
  AGENT_CHAT_CAPABILITY,
  LLM_DEFAULTS,
  VISUAL_CODE_RENDERER_VERSION,
} from '@genfeedai/contracts/constants';
import type {
  IVisualSandboxInput,
  IVisualSandboxReceipt,
  IVisualSandboxResult,
} from '@genfeedai/contracts/interfaces';
import {
  AGENT_TURN_QUEUE,
  NOTIFICATION_DELIVERY_QUEUE,
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  WEBHOOK_CLIENT_QUEUE,
  WORKFLOW_BACKGROUND_QUEUE,
  WORKFLOW_EXECUTION_QUEUE,
} from '@genfeedai/contracts/queue';
import type { Model } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
import type { Job, JobsOptions } from 'bullmq';
import type { Request } from 'express';
import sharp from 'sharp';
import { vi } from 'vitest';

const RENDERER_ORIGIN = 'https://visual-renderer.example.test';
const PAID_MODEL = 'openai/visual-acceptance';
const SOURCE =
  'import React from "react"; import { useCurrentFrame, interpolate } from "remotion"; export const VisualComposition = () => { const frame = useCurrentFrame(); return <div style={{opacity: interpolate(frame, [0, 29], [0, 1])}}>Visual acceptance</div>; };';
const storageTransport = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
}));
vi.mock('@genfeedai/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/storage')>()),
  createStorageProvider: () => storageTransport,
}));

export interface VisualCodeAcceptanceActor {
  user: AuthenticatedUser;
  sourceAssetId: string;
  organizationId: string;
  brandId: string;
  userId: string;
}
interface VisualCodeExternalCalls {
  routes: string[];
  llm: string[];
  renderer: string[];
  rendererSubmissions: string[];
  uploads: string[];
  liveClaims: string[];
}
interface CapturedWorkflowJob {
  id: string;
  name: string;
  queueName: string;
  data: WorkflowExecutionJobData;
  opts: JobsOptions;
  attemptsMade: number;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  getState(): Promise<string>;
  updateData(data: WorkflowExecutionJobData): Promise<void>;
  remove(): Promise<void>;
}
interface CapturedWorkflowQueue {
  name: string;
  jobs: Map<string, CapturedWorkflowJob>;
  add(
    name: string,
    data: WorkflowExecutionJobData,
    opts?: JobsOptions,
  ): Promise<CapturedWorkflowJob>;
  getJob(id: string): Promise<CapturedWorkflowJob | undefined>;
}
interface VisualCodeFixtureSeedState {
  actors: VisualCodeAcceptanceActor[];
  modelIds: string[];
  originalModels: Model[];
  userIds: string[];
  organizationIds: string[];
  brandIds: string[];
  roleIds: string[];
  initialCanonicalMirrorIds: string[];
  ownedCanonicalMirrorIds: Set<string>;
  mirrorOwnershipReady: boolean;
  fallbackModelId: string;
  metadataIds: string[];
  createdSystemUser: boolean;
  createdSystemOrganization: boolean;
}
export interface VisualCodeAcceptanceFixture {
  moduleRef: TestingModule;
  prisma: PrismaService;
  controller: VisualProjectsController;
  library: IngredientsController;
  credits: CreditsUtilsService;
  calls: VisualCodeExternalCalls;
  objects: Map<string, Buffer>;
  queues: Map<string, CapturedWorkflowQueue>;
  seeds: VisualCodeFixtureSeedState;
  png: Buffer;
  paidModel: string;
  request(user: AuthenticatedUser, originalUrl?: string): Request;
  drainNextWorkflowJob(): Promise<unknown>;
  replayLastWorkflowJob(): Promise<unknown>;
  resetExternalCalls(): void;
  close(): Promise<void>;
}

function createCapturedWorkflowQueue(name: string): CapturedWorkflowQueue {
  const jobs = new Map<string, CapturedWorkflowJob>();
  return {
    name,
    jobs,
    async getJob(id) {
      return jobs.get(id);
    },
    async add(jobName, data, opts = {}) {
      if (!opts.jobId)
        throw new Error('Captured queue requires deterministic jobId');
      const existing = jobs.get(opts.jobId);
      if (existing) return existing;
      const job: CapturedWorkflowJob = {
        id: opts.jobId,
        name: jobName,
        queueName: name,
        data,
        opts,
        attemptsMade: 0,
        state: 'waiting',
        async getState() {
          return job.state;
        },
        async updateData(next) {
          job.data = next;
        },
        async remove() {
          if (job.state === 'active')
            throw new Error('Cannot remove active job');
          jobs.delete(job.id);
        },
      };
      jobs.set(job.id, job);
      return job;
    },
  };
}

function createVisualRendererTransport(
  calls: VisualCodeExternalCalls,
  png: Buffer,
  mp4: Buffer,
) {
  const results = new Map<string, IVisualSandboxResult>();
  const receipts = new Map<string, IVisualSandboxReceipt>();
  const fetchTransport: typeof fetch = async (request, options) => {
    const url = new URL(
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.href
          : request.url,
    );
    const method = options?.method ?? 'GET';
    if (
      url.origin !== RENDERER_ORIGIN ||
      new Headers(options?.headers).get('authorization') !==
        'Bearer fixture-renderer-token' ||
      options?.redirect !== 'error'
    )
      throw new Error(
        'Unexpected renderer transport origin, authentication or redirect policy',
      );
    calls.renderer.push(`${method} ${url.pathname}`);
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json' },
      });
    if (method === 'GET' && url.pathname === '/health')
      return json({
        isReady: true,
        rendererVersion: VISUAL_CODE_RENDERER_VERSION,
      });
    if (method === 'POST' && url.pathname === '/jobs') {
      if (typeof options?.body !== 'string')
        throw new Error('Renderer fixture requires JSON body');
      const input = JSON.parse(options.body) as IVisualSandboxInput;
      calls.rendererSubmissions.push(input.id);
      const media = (
        input.mode === 'preview'
          ? [0, 14, 29].map((frame) => ({ format: 'png' as const, frame }))
          : input.outputs
      ).map((output) => ({
        ...output,
        width: input.settings.width,
        height: input.settings.height,
        bytes: (output.format === 'mp4' ? mp4 : png).toString('base64'),
      }));
      results.set(input.id, {
        rendererVersion: VISUAL_CODE_RENDERER_VERSION,
        media,
        diagnostics: [],
      });
      const receipt: IVisualSandboxReceipt = {
        id: input.id,
        inputHash: createHash('sha256').update(options.body).digest('hex'),
        sourceHash: createHash('sha256').update(input.sourceCode).digest('hex'),
        status: 'completed',
        startedAt: Date.now() - 1000,
        finishedAt: Date.now(),
        computeSeconds: 1,
      };
      receipts.set(input.id, receipt);
      return json(receipt);
    }
    const match = /^\/jobs\/([^/]+)(\/result)?$/.exec(url.pathname);
    if (method === 'GET' && match) {
      const id = decodeURIComponent(match[1]);
      if (match[2]) {
        const result = results.get(id);
        if (!result) throw new Error('Renderer fixture result absent');
        const body = Buffer.from(JSON.stringify(result));
        const header = Buffer.alloc(4);
        header.writeUInt32BE(body.length);
        return new Response(new Uint8Array(Buffer.concat([header, body])), {
          headers: { 'content-type': 'application/octet-stream' },
        });
      }
      const receipt = receipts.get(id);
      if (!receipt) throw new Error('Renderer fixture receipt absent');
      return json(receipt);
    }
    throw new Error(
      `Unexpected renderer fixture request: ${method} ${url.pathname}`,
    );
  };
  return fetchTransport;
}

function unusedPort(label: string): object {
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (name === 'then') return undefined;
        return () => {
          throw new Error(
            `Unexpected nonparticipating fixture port: ${label}.${String(name)}`,
          );
        };
      },
    },
  );
}

export async function createVisualCodeAcceptanceFixture(
  options: { rendererEnabled: string | undefined } = {
    rendererEnabled: 'true',
  },
): Promise<VisualCodeAcceptanceFixture> {
  assertIsolatedDatabaseUrl();
  vi.stubEnv('GENFEED_CLOUD', 'true');
  const calls: VisualCodeExternalCalls = {
    routes: [],
    llm: [],
    renderer: [],
    rendererSubmissions: [],
    uploads: [],
    liveClaims: [],
  };
  const objects = new Map<string, Buffer>();
  const seeds: VisualCodeFixtureSeedState = {
    actors: [],
    modelIds: [],
    originalModels: [],
    metadataIds: [],
    userIds: [],
    organizationIds: [],
    brandIds: [],
    roleIds: [],
    initialCanonicalMirrorIds: [],
    ownedCanonicalMirrorIds: new Set(),
    mirrorOwnershipReady: false,
    fallbackModelId: '',
    createdSystemUser: false,
    createdSystemOrganization: false,
  };
  const queues = new Map(
    [
      WORKFLOW_EXECUTION_QUEUE,
      WORKFLOW_BACKGROUND_QUEUE,
      PLATFORM_SYSTEM_WORKFLOW_QUEUE,
      AGENT_TURN_QUEUE,
    ].map((name) => [name, createCapturedWorkflowQueue(name)]),
  );
  let moduleRef: TestingModule | undefined;
  let prisma: PrismaService | undefined;
  let fixture: VisualCodeAcceptanceFixture | undefined;
  let closed = false;
  try {
    const png = await sharp({
      create: { width: 640, height: 360, channels: 4, background: '#4466aa' },
    })
      .png()
      .toBuffer();
    const mp4 = await readFile(
      fileURLToPath(
        new URL(
          '../../../../../../playwright/e2e/fixtures/media/studio-clip.mp4',
          import.meta.url,
        ),
      ),
    );
    vi.stubGlobal('fetch', createVisualRendererTransport(calls, png, mp4));
    storageTransport.upload.mockImplementation(
      async (bytes: Buffer, key: string) => {
        calls.uploads.push(key);
        objects.set(key, Buffer.from(bytes));
        return `https://media.example.test/${key}`;
      },
    );
    storageTransport.download.mockImplementation(
      async (key: string, target: string) => {
        const bytes = objects.get(key);
        if (!bytes) throw new Error(`Fixture storage object absent: ${key}`);
        await writeFile(target, bytes);
        return target;
      },
    );
    const dispatcher = {
      async getCompletionRoute(modelKey: string): Promise<ILlmCompletionRoute> {
        calls.routes.push(modelKey);
        return {
          modelKey,
          provider: 'openai',
          isAvailable: true,
          isByok: false,
        };
      },
      async chatCompletionForRoute(
        params: OpenRouterChatCompletionParams,
        organizationId: string,
      ): Promise<OpenRouterChatCompletionResponse> {
        const providerPrisma = prisma;
        if (!providerPrisma)
          throw new Error('Prisma fixture is not initialized');
        const claims = await providerPrisma.workflowNodeClaim.findMany({
          where: { organizationId, status: 'running' },
        });
        const live = claims.filter(
          (claim) =>
            claim.leaseOwnerId &&
            claim.leaseExpiresAt !== null &&
            claim.leaseExpiresAt.getTime() > Date.now(),
        );
        if (!live.length)
          throw new Error(
            'Provider boundary reached without actual live workflow claim',
          );
        calls.liveClaims.push(...live.map((claim) => claim.id));
        const inspection = params.max_tokens === 1024;
        calls.llm.push(inspection ? 'inspection' : 'authoring');
        return {
          id: `fixture-completion-${calls.llm.length}`,
          model: PAID_MODEL,
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify(
                  inspection
                    ? { isAccepted: true, issues: [] }
                    : {
                        sourceCode: SOURCE,
                        summary: 'A deterministic title animation',
                      },
                ),
              },
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 100,
            total_tokens: 200,
            cost: 0.0003,
            is_byok: false,
          },
        };
      },
    };
    const publisher = new Proxy(
      {},
      {
        get(_target, name) {
          if (name === 'then') return undefined;
          return async () => undefined;
        },
      },
    );
    const outboundQueue = {
      add: vi.fn().mockResolvedValue({ id: 'fixture-outbound' }),
    };
    const moduleConfig = await E2ETestModule.forRoot({
      useMockGuards: false,
      configOverrides: {
        VISUAL_CODE_RENDERER_ENABLED: options.rendererEnabled,
        VISUAL_CODE_RENDERER_URL: RENDERER_ORIGIN,
        VISUAL_CODE_RENDERER_TOKEN: 'fixture-renderer-token',
        VISUAL_CODE_RENDER_CREDITS_PER_SECOND: '0.01',
      },
      providers: [
        VisualProjectsService,
        VisualProjectAuthorizationService,
        VisualProjectBillingService,
        VisualProjectDispatchService,
        VisualProjectWorkflowService,
        VisualProjectAssetsService,
        VisualProjectAuthoringService,
        VisualProjectRendererClientService,
        AgentChatModelRegistryService,
        AgentModelAccessService,
        OrganizationPaidAccessService,
        IngredientsService,
        OrganizationSettingsService,
        AssetGateService,
        BillingAccountsService,
        CreditsUtilsService,
        CreditBalanceService,
        CreditReservationService,
        CreditTransactionsService,
        TransactionUtil,
        SystemWorkflowRunnerService,
        WorkflowExecutionQueueService,
        WorkflowExecutionsService,
        WorkflowNodeClaimService,
        WorkflowExecutorService,
        AgentStrategiesService,
        ActivityRecorderService,
        WorkflowEventWebhookService,
        WebhookDispatchService,
        WorkflowNotificationQueueService,
        {
          provide: WorkflowEngineAdapterService,
          inject: [LoggerService],
          useFactory: (logger: LoggerService) =>
            new WorkflowEngineAdapterService(
              logger,
              { register() {} } as never,
              unusedPort('trendPublishRegistrar') as never,
            ),
        },
        {
          provide: WORKFLOW_ENGINE_ADAPTER,
          useExisting: WorkflowEngineAdapterService,
        },
        { provide: WORKFLOW_EXECUTOR, useExisting: WorkflowExecutorService },
        { provide: LlmDispatcherService, useValue: dispatcher },
        { provide: NotificationsPublisherService, useValue: publisher },
        {
          provide: CacheInvalidationService,
          useValue: {
            invalidate: async () => undefined,
            invalidateByTags: async () => undefined,
          },
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: {
            invalidateForOrganization: async () => undefined,
            invalidateForUser: async () => undefined,
          },
        },
        ...[...queues].map(([name, queue]) => ({
          provide: getQueueToken(name),
          useValue: queue,
        })),
        {
          provide: getQueueToken(WEBHOOK_CLIENT_QUEUE),
          useValue: outboundQueue,
        },
        {
          provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE),
          useValue: outboundQueue,
        },
      ],
    });
    const compiledModule = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();
    moduleRef = compiledModule;
    const connectedPrisma = compiledModule.get(PrismaService);
    prisma = connectedPrisma;
    await connectedPrisma.onModuleInit();
    const initialMirrors = await connectedPrisma.workflow.findMany({
      where: canonicalMirrorPredicate(),
      select: { id: true },
    });
    seeds.initialCanonicalMirrorIds = initialMirrors.map((row) => row.id);
    if (initialMirrors.length)
      throw new Error(
        'Pre-existing visual canonical mirror prevents fixture ownership',
      );
    seeds.mirrorOwnershipReady = true;
    const systemUser = await connectedPrisma.user.findUnique({
      where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
    });
    if (systemUser?.isDeleted)
      throw new Error('Existing system user is incompatible');
    if (!systemUser) {
      await connectedPrisma.user.create({
        data: createTestUser({
          id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          email: 'visual-system@example.test',
          handle: 'visual-system',
        }),
      });
      seeds.createdSystemUser = true;
    }
    const systemOrganization = await connectedPrisma.organization.findUnique({
      where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
    });
    if (
      systemOrganization &&
      (systemOrganization.isDeleted ||
        systemOrganization.userId !== SYSTEM_WORKFLOW_PRINCIPAL_ID)
    )
      throw new Error('Existing system organization is incompatible');
    if (!systemOrganization) {
      await connectedPrisma.organization.create({
        data: createTestOrganization({
          id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          slug: 'visual-system-fixture',
        }),
      });
      seeds.createdSystemOrganization = true;
    }
    const fallback = await connectedPrisma.model.findFirst({
      where: {
        key: LLM_DEFAULTS.agentChat,
        organizationId: null,
        isDeleted: false,
      },
    });
    if (fallback) {
      if (
        fallback.category !== ModelCategory.TEXT ||
        !fallback.isActive ||
        fallback.lifecycle === ModelLifecycle.RETIRED ||
        (!fallback.capabilities.includes(AGENT_CHAT_CAPABILITY) &&
          !fallback.recommendedFor.includes(AGENT_CHAT_CAPABILITY)) ||
        ![
          fallback.inputCostPerMillionTokens,
          fallback.outputCostPerMillionTokens,
        ].every(
          (value) =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0,
        )
      )
        throw new Error('Existing fallback model is incompatible');
      seeds.originalModels.push(fallback);
      seeds.fallbackModelId = fallback.id;
    } else {
      const row = await connectedPrisma.model.create({
        data: fixtureModel(LLM_DEFAULTS.agentChat, false),
      });
      seeds.modelIds.push(row.id);
      seeds.fallbackModelId = row.id;
    }
    if (await connectedPrisma.model.findUnique({ where: { key: PAID_MODEL } }))
      throw new Error('Dedicated visual acceptance model already exists');
    const paidModel = await connectedPrisma.model.create({
      data: fixtureModel(PAID_MODEL, true),
    });
    seeds.modelIds.push(paidModel.id);
    const controller = new VisualProjectsController(
      compiledModule.get(VisualProjectsService),
    );
    const library = new IngredientsController(
      compiledModule.get(IngredientsService),
      unusedPort('folders') as never,
      unusedPort('cancellation') as never,
      compiledModule.get(ConfigService),
      unusedPort('mediaURLs') as never,
    );
    const processor = new WorkflowExecutionProcessor(
      compiledModule.get(LoggerService),
      compiledModule.get(WorkflowExecutorService),
      compiledModule.get(WorkflowExecutionQueueService),
      unusedPort('scheduler') as never,
      compiledModule.get(SystemWorkflowRunnerService),
    );
    let lastJob: CapturedWorkflowJob | undefined;
    const runJob = async (job: CapturedWorkflowJob) => {
      job.state = 'active';
      try {
        const result = await processor.process(
          job as unknown as Job<WorkflowExecutionJobData>,
        );
        job.state = 'completed';
        return result;
      } catch (error) {
        job.state = 'failed';
        throw error;
      }
    };
    const createdFixture: VisualCodeAcceptanceFixture = {
      moduleRef: compiledModule,
      prisma: connectedPrisma,
      controller,
      library,
      credits: compiledModule.get(CreditsUtilsService),
      calls,
      objects,
      queues,
      seeds,
      png,
      paidModel: PAID_MODEL,
      request(_user, originalUrl = '/visual-projects') {
        return {
          originalUrl,
          params: {},
          query: {},
          context: { isSuperAdmin: false },
        } as unknown as Request;
      },
      async drainNextWorkflowJob() {
        const job = [...queues.values()]
          .flatMap((queue) => [...queue.jobs.values()])
          .find((candidate) => candidate.state === 'waiting');
        if (!job) throw new Error('No captured workflow job');
        lastJob = job;
        return runJob(job);
      },
      async replayLastWorkflowJob() {
        if (!lastJob) throw new Error('No prior job');
        lastJob.attemptsMade++;
        return runJob(lastJob);
      },
      resetExternalCalls() {
        for (const values of Object.values(calls)) values.length = 0;
      },
      async close() {
        if (closed) return;
        closed = true;
        try {
          await cleanupVisualCodeFixture(createdFixture);
        } finally {
          try {
            await compiledModule.close();
          } finally {
            storageTransport.upload.mockReset();
            storageTransport.download.mockReset();
            vi.unstubAllGlobals();
            vi.unstubAllEnvs();
          }
        }
      },
    };
    fixture = createdFixture;
    const registry = compiledModule.get(AgentChatModelRegistryService);
    await registry.refresh();
    const runner = compiledModule.get(SystemWorkflowRunnerService);
    runner.onModuleInit();
    compiledModule.get(VisualProjectWorkflowService).onModuleInit();
    compiledModule.get(VisualProjectsService).onModuleInit();
    runner.onApplicationBootstrap();
    return createdFixture;
  } catch (error) {
    try {
      if (fixture) await fixture.close();
      else if (prisma) await cleanupVisualCodeSeedState(prisma, seeds);
    } finally {
      if (!closed) await moduleRef?.close();
      storageTransport.upload.mockReset();
      storageTransport.download.mockReset();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
    throw error;
  }
}

function fixtureModel(key: string, vision: boolean) {
  return {
    id: generateIdString(),
    key,
    label: vision ? 'Visual acceptance' : 'Visual acceptance fallback',
    endpoint: `https://provider.example.test/${vision ? 'visual' : 'fallback'}`,
    category: ModelCategory.TEXT,
    provider: ModelProvider.OPENROUTER,
    organizationId: null,
    capabilities: vision
      ? [AGENT_CHAT_CAPABILITY, 'vision']
      : [AGENT_CHAT_CAPABILITY],
    recommendedFor: [AGENT_CHAT_CAPABILITY],
    supportsFeatures: vision ? ['vision'] : [],
    lifecycle: ModelLifecycle.AVAILABLE,
    isActive: true,
    isDeleted: false,
    isDefault: false,
    isFree: false,
    cost: 1,
    inputCostPerMillionTokens: 1,
    outputCostPerMillionTokens: 2,
  };
}

export async function seedVisualCodeAcceptanceActor(
  fixture: VisualCodeAcceptanceFixture,
  options: { paid?: boolean; credits?: boolean } = {},
): Promise<VisualCodeAcceptanceActor> {
  const { prisma, seeds } = fixture;
  const userId = generateIdString();
  const organizationId = generateIdString();
  const brandId = generateIdString();
  await prisma.user.create({
    data: createTestUser({
      id: userId,
      email: `${userId}@example.test`,
      handle: `visual-${userId}`,
    }),
  });
  seeds.userIds.push(userId);
  await prisma.organization.create({
    data: createTestOrganization({
      id: organizationId,
      userId,
      slug: `visual-${organizationId}`,
    }),
  });
  seeds.organizationIds.push(organizationId);
  await prisma.brand.create({
    data: createTestBrand({
      id: brandId,
      organizationId,
      userId,
      slug: `visual-${brandId}`,
    }),
  });
  seeds.brandIds.push(brandId);
  let role = await prisma.role.findUnique({ where: { key: MemberRole.OWNER } });
  if (role?.isDeleted) throw new Error('Existing owner role is incompatible');
  if (!role) {
    role = await prisma.role.create({
      data: { id: generateIdString(), key: MemberRole.OWNER, label: 'Owner' },
    });
    seeds.roleIds.push(role.id);
  }
  await prisma.member.create({
    data: createTestMember({
      organizationId,
      userId,
      currentBrandId: brandId,
      roleId: role.id,
    }),
  });
  const paid = options.paid !== false;
  const modelId = paid
    ? seeds.modelIds.find((id) => id !== seeds.fallbackModelId)
    : seeds.fallbackModelId;
  if (!modelId) throw new Error('Fixture model missing');
  await prisma.organizationSetting.create({
    data: createTestOrganizationSetting({
      organizationId,
      defaultModel: modelId,
      enabledModelIds: [modelId],
      subscriptionTier: paid ? 'pro' : 'free',
    }),
  });
  if (paid)
    await prisma.subscription.create({
      data: {
        id: generateIdString(),
        organizationId,
        userId,
        plan: SubscriptionPlan.MONTHLY,
        currentPeriodStart: new Date(Date.now() - 60_000),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
      },
    });
  await fixture.moduleRef
    .get(BillingAccountsService)
    .ensureForOrganization({ organizationId, userId });
  if (options.credits !== false)
    await fixture.credits.addOrganizationCreditsWithExpiration(
      organizationId,
      5000,
      'test-seed',
      'Visual acceptance starting balance',
      new Date(Date.now() + 30 * 24 * 3600_000),
    );
  const metadataId = generateIdString();
  const sourceAssetId = generateIdString();
  const sourceKey = `visual-fixture/${organizationId}/${sourceAssetId}.png`;
  await prisma.metadata.create({
    data: {
      id: metadataId,
      label: 'Visual source',
      extension: MetadataExtension.PNG,
      width: 640,
      height: 360,
      size: fixture.png.length,
      result: `https://media.example.test/${sourceKey}`,
    },
  });
  seeds.metadataIds.push(metadataId);
  await prisma.ingredient.create({
    data: {
      id: sourceAssetId,
      organizationId,
      brandId,
      userId,
      metadataId,
      category: IngredientCategory.IMAGE,
      status: IngredientStatus.GENERATED,
      s3Key: sourceKey,
      mimeType: 'image/png',
      fileSize: fixture.png.length,
    },
  });
  fixture.objects.set(sourceKey, fixture.png);
  const actor: VisualCodeAcceptanceActor = {
    userId,
    organizationId,
    brandId,
    sourceAssetId,
    user: { id: userId, userId, organizationId, brandId, isSuperAdmin: false },
  };
  seeds.actors.push(actor);
  return actor;
}

async function cleanupVisualCodeFixture(
  fixture: VisualCodeAcceptanceFixture,
): Promise<void> {
  await cleanupVisualCodeSeedState(fixture.prisma, fixture.seeds);
}

async function cleanupVisualCodeSeedState(
  prisma: PrismaService,
  seeds: VisualCodeFixtureSeedState,
): Promise<void> {
  if (seeds.mirrorOwnershipReady) {
    const mirrors = await prisma.workflow.findMany({
      where: canonicalMirrorPredicate(),
    });
    if (mirrors.length > 1)
      throw new Error('Ambiguous visual canonical mirror ownership');
    for (const mirror of mirrors) {
      if (
        seeds.initialCanonicalMirrorIds.includes(mirror.id) ||
        !isHiddenSystemWorkflowMetadata(mirror.metadata) ||
        !isProtectedSystemWorkflowMetadata(mirror.metadata) ||
        getSystemWorkflowMetadata(mirror.metadata)?.canonicalId !==
          'visual-code.execute'
      )
        throw new Error(
          'Unexpected visual canonical mirror metadata or ownership',
        );
      seeds.ownedCanonicalMirrorIds.add(mirror.id);
    }
  }
  for (const original of seeds.originalModels) {
    deepStrictEqual(
      await prisma.model.findUnique({ where: { id: original.id } }),
      original,
      'Existing fallback model must remain unchanged',
    );
  }
  const organizationId = { in: seeds.organizationIds };
  const scope = { organizationId, isDeleted: false };
  const revisions = await prisma.visualRevision.findMany({
    where: scope,
    select: { id: true },
  });
  const projects = await prisma.visualProject.findMany({
    where: scope,
    select: { id: true },
  });
  const ingredients = await prisma.ingredient.findMany({
    where: scope,
    select: { id: true, metadataId: true },
  });
  const executions = await prisma.workflowExecution.findMany({
    where: scope,
    select: { id: true, workflowId: true },
  });
  const executionId = { in: executions.map((row) => row.id) };
  await prisma.visualRevision.deleteMany({
    where: { ...scope, id: { in: revisions.map((row) => row.id) } },
  });
  await prisma.visualProject.deleteMany({
    where: { ...scope, id: { in: projects.map((row) => row.id) } },
  });
  await prisma.ingredient.deleteMany({
    where: { ...scope, id: { in: ingredients.map((row) => row.id) } },
  });
  await prisma.workflowNodeClaim.deleteMany({
    where: { organizationId, executionId },
  });
  await prisma.workflowExecutionNodeResult.deleteMany({
    where: { organizationId, executionId },
  });
  await prisma.workflowExecution.deleteMany({
    where: { ...scope, id: executionId },
  });
  await prisma.workflow.deleteMany({
    where: {
      ...canonicalMirrorPredicate(),
      id: { in: [...seeds.ownedCanonicalMirrorIds] },
    },
  });
  const metadataIds = [
    ...seeds.metadataIds,
    ...ingredients.flatMap((row) => (row.metadataId ? [row.metadataId] : [])),
  ];
  await prisma.metadata.deleteMany({
    where: { id: { in: metadataIds }, isDeleted: false },
  });
  const events = await prisma.notificationEvent.findMany({
    where: scope,
    select: { id: true },
  });
  await prisma.notificationDelivery.deleteMany({
    where: {
      organizationId,
      eventId: { in: events.map((row) => row.id) },
      isDeleted: false,
    },
  });
  await prisma.notificationInboxItem.deleteMany({ where: scope });
  await prisma.notificationEvent.deleteMany({
    where: { ...scope, id: { in: events.map((row) => row.id) } },
  });
  await prisma.activity.deleteMany({ where: scope });
  await prisma.creditTransaction.deleteMany({ where: scope });
  await prisma.creditReservation.deleteMany({ where: scope });
  const accounts = await prisma.organization.findMany({
    where: { id: organizationId, isDeleted: false },
    select: { billingAccountId: true },
  });
  const billingAccountId = {
    in: accounts.flatMap((row) =>
      row.billingAccountId ? [row.billingAccountId] : [],
    ),
  };
  await prisma.creditBalance.deleteMany({
    where: { OR: [{ organizationId }, { billingAccountId }], isDeleted: false },
  });
  await prisma.subscription.deleteMany({ where: scope });
  await prisma.billingAccountOrganization.deleteMany({
    where: { organizationId, billingAccountId, isDeleted: false },
  });
  await prisma.billingAccountMember.deleteMany({
    where: {
      billingAccountId,
      userId: { in: seeds.userIds },
      isDeleted: false,
    },
  });
  await prisma.organizationSetting.deleteMany({ where: { organizationId } });
  await prisma.member.deleteMany({ where: scope });
  await prisma.brand.deleteMany({
    where: { ...scope, id: { in: seeds.brandIds } },
  });
  await prisma.organization.deleteMany({
    where: { id: organizationId, isDeleted: false },
  });
  await prisma.billingAccount.deleteMany({
    where: { id: billingAccountId, isDeleted: false },
  });
  await prisma.user.deleteMany({
    where: { id: { in: seeds.userIds }, isDeleted: false },
  });
  await prisma.role.deleteMany({
    where: { id: { in: seeds.roleIds }, isDeleted: false },
  });
  await prisma.model.deleteMany({
    where: {
      id: { in: seeds.modelIds },
      organizationId: null,
      isDeleted: false,
    },
  });
  if (seeds.createdSystemOrganization)
    await prisma.organization.delete({
      where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
    });
  if (seeds.createdSystemUser)
    await prisma.user.delete({ where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID } });
}

function canonicalMirrorPredicate() {
  return {
    organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
    isDeleted: false,
    metadata: {
      path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
      equals: 'visual-code.execute',
    },
  };
}
