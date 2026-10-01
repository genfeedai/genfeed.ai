import { deepStrictEqual } from 'node:assert';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { type AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
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
import { WorkflowEngineExecutorRegistryService } from '@api/collections/workflows/services/workflow-engine-executor-registry.service';
import {
  type WorkflowExecutionJobData,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowNodeClaimService } from '@api/collections/workflows/services/workflow-node-claim.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
import { WorkflowTrendPublishExecutorRegistrarService } from '@api/collections/workflows/services/workflow-trend-publish-executor-registrar.service';
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
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
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
import { LocalStorageProvider } from '@genfeedai/storage';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { WorkflowExecutionProcessor } from '@workers/processors/api/collections/workflows/services/workflow-execution.processor';
import { type Job, type JobsOptions, Queue, Worker } from 'bullmq';
import type { Request } from 'express';
import sharp from 'sharp';
import { vi } from 'vitest';
import { z } from 'zod';

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
  sourceAssetIds: string[];
  assetsByKind: { image: string; video?: string; audio?: string };
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
  runtime?: VisualCodeRuntimeFixture;
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

export type VisualCodeScriptedScenario =
  | 'hybrid-success'
  | 'compile-recovery'
  | 'visual-rejection';
export interface VisualCodeRuntimeOptions {
  rendererUrl: string;
  rendererToken: string;
  redisUrl: string;
  artifactDirectory: string;
  mediaDirectory: string;
  scenario: VisualCodeScriptedScenario;
}
export interface VisualCodeRuntimeFixture {
  queues: Map<string, Queue<WorkflowExecutionJobData>>;
  prefix: string;
  workerErrors: string[];
  receipts: IVisualSandboxReceipt[];
  directory: string;
  mediaDirectory: string;
  assertions: string[];
  outcome: string;
  walletBaselines: Map<string, { settled: number; held: number }>;
  startWorker(): Promise<void>;
  waitForJob(jobId: string, timeoutMs?: number): Promise<void>;
  redeliver(jobId: string): Promise<void>;
  writeEvidence(label: string): Promise<void>;
  close(): Promise<void>;
}
const versionLine = z
  .string()
  .min(1)
  .max(512)
  .refine((value) =>
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    }),
  )
  .refine((value) => value.trim() === value);
const runtimePreflightSchema = z.strictObject({
  gitHead: z.string().regex(/^[a-f0-9]{40}$/),
  platform: z.literal('linux'),
  nodeVersion: z.string().regex(/^v24\.\d+\.\d+$/),
  ffmpegVersion: versionLine,
  ffprobeVersion: versionLine,
  runscVersion: versionLine,
  imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  dockerRuntime: z.literal('runsc'),
  rendererVersion: z.literal(VISUAL_CODE_RENDERER_VERSION),
});
export async function readVisualRuntimePreflight(root: string) {
  const path = join(root, 'runtime-preflight.json');
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384)
    throw new Error('Unsafe runtime preflight file');
  const bytes = await readFile(path);
  const metadata = runtimePreflightSchema.parse(JSON.parse(bytes.toString()));
  const head = (
    await promisify(execFile)('git', ['rev-parse', 'HEAD'])
  ).stdout.trim();
  if (metadata.gitHead !== head)
    throw new Error(
      'Runtime preflight head differs from verification checkout',
    );
  return { metadata, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const WORKFLOW_QUEUES = [
  WORKFLOW_EXECUTION_QUEUE,
  WORKFLOW_BACKGROUND_QUEUE,
  PLATFORM_SYSTEM_WORKFLOW_QUEUE,
  AGENT_TURN_QUEUE,
];
const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
async function validateRuntimeOptions(options: VisualCodeRuntimeOptions) {
  for (const value of Object.values(options))
    if (!value)
      throw new Error('Missing explicit local-runtime fixture option');
  for (const [value, protocol] of [
    [options.rendererUrl, 'http:'],
    [options.redisUrl, 'redis:'],
  ]) {
    const url = new URL(value);
    if (
      url.protocol !== protocol ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (protocol === 'http:'
        ? url.pathname !== '/'
        : !url.port || !/^\/\d+$/.test(url.pathname))
    )
      throw new Error(
        'Local-runtime URL must be explicit loopback without credentials or extra URL fields',
      );
  }
  if (options.rendererToken.length < 32)
    throw new Error('Local-runtime token must be at least 32 characters');
  for (const directory of [options.artifactDirectory, options.mediaDirectory]) {
    if (
      !isAbsolute(directory) ||
      !(await lstat(directory)).isDirectory() ||
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      throw new Error(
        'Local-runtime paths must be existing absolute real directories without symlinks',
      );
  }
  if ((await readdir(options.artifactDirectory)).length)
    throw new Error('Local-runtime scenario directory must be empty');
  for (const file of ['image.png', 'clip.mp4', 'audio.wav']) {
    const path = join(options.mediaDirectory, file);
    if (!(await lstat(path)).isFile() || (await lstat(path)).isSymbolicLink())
      throw new Error('Generated hybrid media is missing or unsafe');
  }
  if (
    !['hybrid-success', 'compile-recovery', 'visual-rejection'].includes(
      options.scenario,
    )
  )
    throw new Error('Unknown scripted scenario');
  await writeFile(
    join(options.artifactDirectory, 'owner.json'),
    JSON.stringify({ scenario: options.scenario, id: randomUUID() }),
    { flag: 'wx', mode: 0o600 },
  );
}
function hybridSource(ids: string[]) {
  if (ids.length !== 3)
    throw new Error('Hybrid authoring requires exactly three local asset IDs');
  return `import React from 'react'; import {AbsoluteFill,Img,OffthreadVideo,Audio,staticFile} from 'remotion'; export function VisualComposition({title='Hybrid acceptance'}) {return <AbsoluteFill><OffthreadVideo src={staticFile('assets/${ids[1]}')} style={{position:'absolute',left:0,top:0,width:320,height:360,objectFit:'fill'}}/><Img src={staticFile('assets/${ids[0]}')} style={{position:'absolute',left:320,top:0,width:320,height:360,objectFit:'fill'}}/><Audio src={staticFile('assets/${ids[2]}')}/><div style={{position:'absolute',top:24,left:24,color:'white',fontSize:28}}>{title}</div></AbsoluteFill>}`;
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
        if (
          [
            'then',
            'onModuleInit',
            'onApplicationBootstrap',
            'onModuleDestroy',
            'beforeApplicationShutdown',
            'onApplicationShutdown',
          ].some((hook) => hook === name)
        )
          return undefined;
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
  options: { rendererEnabled?: string; runtime?: VisualCodeRuntimeOptions } = {
    rendererEnabled: 'true',
  },
): Promise<VisualCodeAcceptanceFixture> {
  assertIsolatedDatabaseUrl();
  const runtimeOptions = options.runtime;
  const runtimePreflight = runtimeOptions
    ? await readVisualRuntimePreflight(
        dirname(runtimeOptions.artifactDirectory),
      )
    : undefined;
  if (runtimeOptions) await validateRuntimeOptions(runtimeOptions);
  const originalFetch = globalThis.fetch;
  const actualQueues = new Map<string, Queue<WorkflowExecutionJobData>>();
  const receipts: IVisualSandboxReceipt[] = [];
  const submissions: IVisualSandboxInput[] = [];
  const dispatcherEvidence: {
    kind: string;
    promptHash: string;
    sourceHash?: string;
    diagnosticHash?: string;
    syntheticUsage: boolean;
  }[] = [];
  let runtimeHandle: VisualCodeRuntimeFixture | undefined;
  let worker: Worker<WorkflowExecutionJobData> | undefined;
  let workerRun: Promise<void> | undefined;
  let workerPause: Promise<void> | undefined;
  const workerErrors: string[] = [];
  const prefix = `visual5695-${randomUUID()}`;
  let localStorage: LocalStorageProvider | undefined;
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
    ]
      .filter(() => !runtimeOptions)
      .map((name) => [name, createCapturedWorkflowQueue(name)]),
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
    if (runtimeOptions) {
      await mkdir(join(runtimeOptions.artifactDirectory, 'storage'), {
        mode: 0o700,
      });
      localStorage = new LocalStorageProvider(
        join(runtimeOptions.artifactDirectory, 'storage'),
      );
      vi.stubGlobal(
        'fetch',
        async (
          request: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) => {
          const url = new URL(
            typeof request === 'string'
              ? request
              : request instanceof URL
                ? request.href
                : request.url,
          );
          if (
            url.origin !== new URL(runtimeOptions.rendererUrl).origin ||
            init?.redirect !== 'error'
          )
            throw new Error(
              'Rejected nonlocal renderer request or redirect policy',
            );
          const method = init?.method ?? 'GET';
          calls.renderer.push(`${method} ${url.pathname}`);
          if (method === 'POST' && url.pathname === '/jobs') {
            if (typeof init?.body !== 'string')
              throw new Error('Expected actual renderer JSON input');
            const input = JSON.parse(init.body) as IVisualSandboxInput;
            submissions.push(input);
            calls.rendererSubmissions.push(input.id);
            await writeFile(
              join(runtimeOptions.artifactDirectory, `${input.id}.tsx`),
              input.sourceCode,
            );
          }
          const response = await originalFetch(request, init);
          if (/^\/jobs\/[^/]+$/.test(url.pathname) && response.ok)
            receipts.push(
              (await response.clone().json()) as IVisualSandboxReceipt,
            );
          if (url.pathname.endsWith('/result') && response.ok) {
            const frame = Buffer.from(await response.clone().arrayBuffer());
            const result = JSON.parse(
              frame.subarray(4).toString(),
            ) as IVisualSandboxResult;
            for (const [index, media] of result.media.entries())
              await writeFile(
                join(
                  runtimeOptions.artifactDirectory,
                  `${url.pathname.split('/')[2]}-${index}.${media.format}`,
                ),
                Buffer.from(media.bytes, 'base64'),
              );
            await writeFile(
              join(
                runtimeOptions.artifactDirectory,
                `${url.pathname.split('/')[2]}-diagnostics.json`,
              ),
              JSON.stringify(result.diagnostics),
            );
          }
          return response;
        },
      );
      const health = await fetch(
        new URL('/health', runtimeOptions.rendererUrl),
        {
          headers: { authorization: `Bearer ${runtimeOptions.rendererToken}` },
          redirect: 'error',
          signal: AbortSignal.timeout(10000),
        },
      );
      const healthData = (await health.json()) as {
        isReady: boolean;
        rendererVersion: string;
      };
      if (
        !health.ok ||
        !healthData.isReady ||
        healthData.rendererVersion !== VISUAL_CODE_RENDERER_VERSION
      )
        throw new Error('Actual renderer is not ready');
      for (const name of WORKFLOW_QUEUES) {
        const queue = new Queue<WorkflowExecutionJobData>(name, {
          connection: { url: runtimeOptions.redisUrl },
          prefix,
        });
        actualQueues.set(name, queue);
        queue.on('error', (error) => workerErrors.push(error.message));
        await queue.waitUntilReady();
      }
    } else
      vi.stubGlobal('fetch', createVisualRendererTransport(calls, png, mp4));
    storageTransport.upload.mockImplementation(
      async (bytes: Buffer, key: string) => {
        calls.uploads.push(key);
        if (localStorage) return localStorage.upload(bytes, key);
        objects.set(key, Buffer.from(bytes));
        return `https://media.example.test/${key}`;
      },
    );
    storageTransport.download.mockImplementation(
      async (key: string, target: string, root: string) => {
        if (localStorage) return localStorage.download(key, target, root);
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
        let content:
          | { isAccepted: boolean; issues: string[] }
          | { sourceCode: string; summary: string } = inspection
          ? { isAccepted: true, issues: [] }
          : { sourceCode: SOURCE, summary: 'A deterministic title animation' };
        if (runtimeOptions) {
          const sequence =
            runtimeOptions.scenario === 'compile-recovery'
              ? ['authoring', 'authoring', 'inspection']
              : runtimeOptions.scenario === 'visual-rejection'
                ? [
                    'authoring',
                    'inspection',
                    'authoring',
                    'inspection',
                    'authoring',
                    'inspection',
                  ]
                : ['authoring', 'inspection'];
          const kind = inspection ? 'inspection' : 'authoring';
          // Source-preserving revisions require only inspections after initial authoring.
          if (
            dispatcherEvidence.length < sequence.length
              ? sequence[dispatcherEvidence.length] !== kind
              : kind !== 'inspection' ||
                runtimeOptions.scenario !== 'hybrid-success' ||
                dispatcherEvidence.length >= 5
          )
            throw new Error(
              'Unexpected or excessive scripted dispatcher invocation',
            );
          if (inspection) {
            const images = params.messages
              .flatMap((message) =>
                Array.isArray(message.content) ? message.content : [],
              )
              .filter((item) => item.type === 'image_url');
            if (
              images.length !== 3 ||
              images.some(
                (item) =>
                  !item.image_url?.url.startsWith('data:image/png;base64,'),
              )
            )
              throw new Error(
                'Inspection must receive three actual preview data URLs',
              );
            content = {
              isAccepted: runtimeOptions.scenario !== 'visual-rejection',
              issues:
                runtimeOptions.scenario === 'visual-rejection'
                  ? ['Scripted visual rejection: title requires repair']
                  : [],
            };
            dispatcherEvidence.push({
              kind,
              promptHash: sha256(JSON.stringify(params.messages)),
              syntheticUsage: true,
            });
          } else {
            const message = params.messages.find(
              (item) => item.role === 'user',
            );
            if (!message || typeof message.content !== 'string')
              throw new Error('Actual authoring prompt absent');
            const prompt = JSON.parse(message.content) as {
              assetIds: string;
              diagnostics: string;
            };
            const sourceCode =
              runtimeOptions.scenario === 'compile-recovery' &&
              dispatcherEvidence.length === 0
                ? 'export const VisualComposition = () => <div'
                : hybridSource(JSON.parse(prompt.assetIds) as string[]);
            content = {
              sourceCode,
              summary: 'Scripted hybrid composition; synthetic provider usage',
            };
            dispatcherEvidence.push({
              kind,
              promptHash: sha256(message.content),
              sourceHash: sha256(sourceCode),
              diagnosticHash: sha256(prompt.diagnostics),
              syntheticUsage: true,
            });
          }
        }
        return {
          id: `fixture-completion-${calls.llm.length}`,
          model: PAID_MODEL,
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: JSON.stringify(content),
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
    const executorRegistry: Pick<
      WorkflowEngineExecutorRegistryService,
      'register'
    > = { register() {} };
    const moduleConfig = await E2ETestModule.forRoot({
      useMockGuards: false,
      configOverrides: {
        VISUAL_CODE_RENDERER_ENABLED: options.rendererEnabled,
        VISUAL_CODE_RENDERER_URL:
          runtimeOptions?.rendererUrl ?? RENDERER_ORIGIN,
        VISUAL_CODE_RENDERER_TOKEN:
          runtimeOptions?.rendererToken ?? 'fixture-renderer-token',
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
        MembersService,
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
        WorkflowEngineAdapterService,
        VisualProjectsController,
        IngredientsController,
        WorkflowExecutionProcessor,
        {
          provide: WorkflowEngineExecutorRegistryService,
          useValue: executorRegistry,
        },
        {
          provide: WorkflowTrendPublishExecutorRegistrarService,
          useValue: unusedPort('trendPublishRegistrar'),
        },
        {
          provide: WorkflowSchedulerService,
          useValue: unusedPort('scheduler'),
        },
        { provide: FoldersService, useValue: unusedPort('folders') },
        {
          provide: IngredientGenerationCancellationService,
          useValue: unusedPort('cancellation'),
        },
        { provide: MediaUrlService, useValue: unusedPort('mediaURLs') },
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
        ...[...(runtimeOptions ? actualQueues : queues)].map(
          ([name, queue]) => ({
            provide: getQueueToken(name),
            useValue: queue,
          }),
        ),
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
    const controller = compiledModule.get(VisualProjectsController);
    const library = compiledModule.get(IngredientsController);
    const processor = compiledModule.get(WorkflowExecutionProcessor);
    if (runtimeOptions) {
      worker = new Worker<WorkflowExecutionJobData>(
        WORKFLOW_EXECUTION_QUEUE,
        (job) => processor.process(job),
        {
          connection: { url: runtimeOptions.redisUrl },
          prefix,
          ...withLongJobWorkerOptions({ concurrency: 1, autorun: false }),
        },
      );
      worker.on('error', (error) => workerErrors.push(error.message));
      worker.on('failed', (job, error) =>
        workerErrors.push(`${job?.id}: ${error.message}`),
      );
      const observedCompletions = new Set<string>();
      // Record the actual worker event only after its local pause completes.
      // Broker state may become completed before this listener runs.
      worker.on('completed', (job) => {
        const id = job.id;
        if (!id || !worker) {
          workerErrors.push('Actual completion event has no worker or job ID');
          return;
        }
        workerPause = worker.pause(true);
        void workerPause
          .then(() => observedCompletions.add(id))
          .catch((error: unknown) => {
            workerErrors.push(
              error instanceof Error ? error.message : String(error),
            );
          });
      });
      const executionQueue = actualQueues.get(WORKFLOW_EXECUTION_QUEUE);
      if (!executionQueue) throw new Error('Real execution queue absent');
      let runtimeClosed = false;
      runtimeHandle = {
        queues: actualQueues,
        prefix,
        workerErrors,
        receipts,
        directory: runtimeOptions.artifactDirectory,
        mediaDirectory: runtimeOptions.mediaDirectory,
        assertions: [],
        outcome: 'incomplete',
        walletBaselines: new Map(),
        async startWorker() {
          for (const [name, queue] of actualQueues)
            if (
              name !== WORKFLOW_EXECUTION_QUEUE &&
              (await queue.getJobCountByTypes(
                'waiting',
                'active',
                'delayed',
                'failed',
                'completed',
              ))
            )
              throw new Error('Unexpected work on another workflow queue');
          await workerPause;
          if (workerRun) worker?.resume();
          if (!workerRun) {
            if (!worker) throw new Error('Worker absent');
            workerRun = worker.run().catch((error: unknown) => {
              workerErrors.push(
                error instanceof Error ? error.message : String(error),
              );
            });
          }
        },
        async waitForJob(jobId, timeoutMs = 660000) {
          if (timeoutMs > 660000 || timeoutMs <= 0)
            throw new Error('Invalid runtime wait bound');
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            if (workerErrors.length) throw new Error(workerErrors.join('\n'));
            const job = await executionQueue.getJob(jobId);
            if (!job) throw new Error('Actual broker job absent');
            const state = await job.getState();
            if (state === 'completed' && observedCompletions.has(jobId)) return;
            if (state === 'failed') throw new Error(job.failedReason);
            await new Promise((accept) => setTimeout(accept, 100));
          }
          throw new Error(`Actual broker job timed out: ${jobId}`);
        },
        async redeliver(jobId) {
          const original = await executionQueue.getJob(jobId);
          if (!original) throw new Error('Saved broker delivery absent');
          const duplicate = await executionQueue.add(
            original.name,
            original.data,
            {
              jobId: `redelivery-${randomUUID()}`,
              removeOnComplete: false,
              removeOnFail: false,
            },
          );
          if (!duplicate.id) throw new Error('Actual redelivery ID absent');
          await this.startWorker();
          await this.waitForJob(duplicate.id);
        },
        async writeEvidence(label) {
          const exec = promisify(execFile);
          const gitHead = (
            await exec('git', ['rev-parse', 'HEAD'])
          ).stdout.trim();
          const scope = {
            organizationId: { in: seeds.organizationIds },
            isDeleted: false,
          };
          const [
            revisions,
            ingredients,
            reservations,
            transactions,
            executions,
            claims,
            jobs,
          ] = await Promise.all([
            connectedPrisma.visualRevision.findMany({ where: scope }),
            connectedPrisma.ingredient.findMany({
              where: scope,
              include: { metadata: true },
            }),
            connectedPrisma.creditReservation.findMany({ where: scope }),
            connectedPrisma.creditTransaction.findMany({ where: scope }),
            connectedPrisma.workflowExecution.findMany({ where: scope }),
            connectedPrisma.workflowNodeClaim.findMany({
              where: { organizationId: scope.organizationId },
            }),
            executionQueue.getJobs([
              'waiting',
              'active',
              'completed',
              'failed',
              'delayed',
            ]),
          ]);
          for (const revision of revisions)
            if (revision.sourceCode)
              await writeFile(
                join(runtimeOptions.artifactDirectory, `${revision.id}.tsx`),
                revision.sourceCode,
              );
          const outputs = await Promise.all(
            ingredients.map(async (row) => {
              const bytes = row.s3Key
                ? await readFile(
                    join(
                      runtimeOptions.artifactDirectory,
                      'storage',
                      row.s3Key,
                    ),
                  ).catch(() => undefined)
                : undefined;
              return {
                id: row.id,
                organizationId: row.organizationId,
                brandId: row.brandId,
                generationSource: row.generationSource,
                sourceActionId: row.sourceActionId,
                mimeType: row.mimeType,
                size: row.fileSize,
                fileHash: bytes ? sha256(bytes) : null,
                provenance: row.providerData,
                metadata: {
                  id: row.metadataId,
                  size: row.metadata?.size,
                  width: row.metadata?.width,
                  height: row.metadata?.height,
                },
              };
            }),
          );
          await writeFile(
            join(runtimeOptions.artifactDirectory, 'revision-snapshots.json'),
            JSON.stringify(
              revisions.map(({ sourceCode: _source, ...revision }) => revision),
              null,
              2,
            ),
          );
          const preflight = await readVisualRuntimePreflight(
            dirname(runtimeOptions.artifactDirectory),
          );
          if (preflight.sha256 !== runtimePreflight?.sha256)
            throw new Error('Runtime preflight changed during run');
          await writeFile(
            join(runtimeOptions.artifactDirectory, 'evidence.json'),
            JSON.stringify(
              {
                gitHead,
                timestamp: new Date().toISOString(),
                label,
                scenario: runtimeOptions.scenario,
                transportMode: 'local-runtime',
                rendererVersion: VISUAL_CODE_RENDERER_VERSION,
                runtimePreflight: preflight.metadata,
                runtimePreflightSha256: preflight.sha256,
                queuePrefix: prefix,
                jobs: jobs.map((job) => ({
                  id: job.id,
                  executionId: job.data.systemRun?.priorExecution?.executionId,
                  type: job.data.type,
                })),
                executions: executions.map((row) => ({
                  id: row.id,
                  workflowId: row.workflowId,
                  workflowVersionId: row.workflowVersionId,
                  status: row.status,
                })),
                claims: claims.map((row) => ({
                  id: row.id,
                  executionId: row.executionId,
                  status: row.status,
                })),
                revisions: revisions.map((row) => ({
                  id: row.id,
                  projectId: row.projectId,
                  status: row.status,
                  sourceHash: row.sourceHash,
                  sourceAssetIds: row.sourceAssetIds,
                  outputs: row.outputs,
                  receipts: row.receipts,
                  consumedCredits: row.consumedCredits,
                  maximumCredits: row.maximumCredits,
                })),
                outputs,
                rendererSubmissions: submissions.map((input) => ({
                  id: input.id,
                  sourceHash: sha256(input.sourceCode),
                  mode: input.mode,
                  assetIds: input.assets.map((asset) => asset.id),
                })),
                rendererReceipts: receipts,
                syntheticProvider: {
                  invocations: dispatcherEvidence,
                  usagePerInvocation: {
                    promptTokens: 100,
                    completionTokens: 100,
                    cost: 0.0003,
                  },
                },
                reservations: reservations.map((row) => ({
                  id: row.id,
                  amount: row.amount,
                  settledAmount: row.settledAmount,
                  status: row.status,
                })),
                transactions: transactions.map((row) => ({
                  id: row.id,
                  amount: row.amount,
                  reservationId: row.reservationId,
                })),
                wallets: await Promise.all(
                  seeds.actors.map(async (actor) => {
                    const snapshot = await compiledModule
                      .get(CreditsUtilsService)
                      .getWalletSnapshot(actor.organizationId);
                    const baseline = this.walletBaselines.get(
                      actor.organizationId,
                    );
                    return {
                      organizationId: actor.organizationId,
                      snapshot,
                      baseline,
                      delta: baseline
                        ? {
                            settled: snapshot.settled - baseline.settled,
                            held: snapshot.held - baseline.held,
                          }
                        : null,
                    };
                  }),
                ),
                assertions: this.assertions,
                outcome: this.outcome,
                workerErrors,
              },
              null,
              2,
            ),
            { mode: 0o600 },
          );
        },
        async close() {
          if (runtimeClosed) return;
          runtimeClosed = true;
          await worker?.close();
          await workerRun;
          for (const queue of actualQueues.values()) {
            try {
              await queue.obliterate({ force: true });
            } finally {
              await queue.close();
            }
          }
        },
      };
    }

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
      runtime: runtimeHandle,
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
        if (runtimeHandle)
          throw new Error('Use actual runtime worker transport');
        const job = [...queues.values()]
          .flatMap((queue) => [...queue.jobs.values()])
          .find((candidate) => candidate.state === 'waiting');
        if (!job) throw new Error('No captured workflow job');
        lastJob = job;
        return runJob(job);
      },
      async replayLastWorkflowJob() {
        if (runtimeHandle)
          throw new Error('Use actual runtime broker redelivery');
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
          try {
            if (runtimeHandle) {
              try {
                await runtimeHandle.writeEvidence('before-cleanup');
              } finally {
                await runtimeHandle.close();
              }
            }
          } finally {
            await cleanupVisualCodeFixture(createdFixture);
          }
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
    if (runtimeOptions)
      await writeFile(
        join(runtimeOptions.artifactDirectory, 'setup-failure.json'),
        JSON.stringify({
          outcome: 'failed',
          phase: 'fixture-setup',
          scenario: runtimeOptions.scenario,
          workerErrors,
        }),
      ).catch(() => undefined);
    try {
      if (fixture) await fixture.close();
      else if (prisma) await cleanupVisualCodeSeedState(prisma, seeds);
    } finally {
      if (!closed) {
        await worker?.close();
        for (const queue of actualQueues.values()) {
          await queue.obliterate({ force: true });
          await queue.close();
        }
        await moduleRef?.close();
      }
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
  const sourceBytes = fixture.runtime
    ? await readFile(join(fixture.runtime.mediaDirectory, 'image.png'))
    : fixture.png;
  const metadataId = generateIdString();
  const sourceAssetId = generateIdString();
  const sourceKey = `visual-fixture/${organizationId}/${sourceAssetId}.png`;
  await prisma.metadata.create({
    data: {
      id: metadataId,
      label: 'Visual source',
      extension: MetadataExtension.PNG,
      width: fixture.runtime ? 64 : 640,
      height: fixture.runtime ? 64 : 360,
      size: sourceBytes.length,
      result: fixture.runtime
        ? `/local/${sourceKey}`
        : `https://media.example.test/${sourceKey}`,
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
      fileSize: sourceBytes.length,
    },
  });
  // Seed through the same selected storage provider as canonical outputs.
  await storageTransport.upload(sourceBytes, sourceKey);
  const sourceAssetIds = [sourceAssetId];
  const assetsByKind: VisualCodeAcceptanceActor['assetsByKind'] = {
    image: sourceAssetId,
  };
  if (fixture.runtime)
    for (const [kind, file, category, extension, mime] of [
      [
        'video',
        'clip.mp4',
        IngredientCategory.VIDEO,
        MetadataExtension.MP4,
        'video/mp4',
      ],
      [
        'audio',
        'audio.wav',
        IngredientCategory.AUDIO,
        MetadataExtension.WAV,
        'audio/wav',
      ],
    ] as const) {
      const id = generateIdString();
      const metadataId = generateIdString();
      const bytes = await readFile(join(fixture.runtime.mediaDirectory, file));
      const key = `visual-fixture/${organizationId}/${id}.${file.split('.')[1]}`;
      await storageTransport.upload(bytes, key);
      await prisma.metadata.create({
        data: {
          id: metadataId,
          label: `Visual source ${kind}`,
          extension,
          size: bytes.length,
          duration: 1,
          ...(kind === 'video' ? { width: 160, height: 90, fps: 30 } : {}),
          result: `/local/${key}`,
        },
      });
      seeds.metadataIds.push(metadataId);
      await prisma.ingredient.create({
        data: {
          id,
          organizationId,
          brandId,
          userId,
          metadataId,
          category,
          status: IngredientStatus.GENERATED,
          s3Key: key,
          mimeType: mime,
          fileSize: bytes.length,
        },
      });
      sourceAssetIds.push(id);
      assetsByKind[kind] = id;
    }
  const actor: VisualCodeAcceptanceActor = {
    userId,
    organizationId,
    brandId,
    sourceAssetId,
    sourceAssetIds,
    assetsByKind,
    user: { id: userId, userId, organizationId, brandId, isSuperAdmin: false },
  };
  seeds.actors.push(actor);
  if (fixture.runtime)
    fixture.runtime.walletBaselines.set(
      organizationId,
      await fixture.credits.getWalletSnapshot(organizationId),
    );
  fixture.calls.uploads.length = 0;
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
