import { deepStrictEqual, rejects, strictEqual } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type {
  OpenRouterChatCompletionParams,
  OpenRouterChatCompletionResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { TestingModule } from '@nestjs/testing';
import { Queue, QueueEvents } from 'bullmq';
import type { Client } from 'pg';
import { vi } from 'vitest';
import { createProductionTurnCleanup } from './proactive-agent-production-turn-cleanup.util';

export const PRODUCTION_TURN_COST_USD = 0.001;
export const PRODUCTION_TURN_MEMORY =
  'OWN_FEEDBACK_4959: explain one concrete experiment in a calm voice.';
export const PRODUCTION_TURN_VOICE = 'OWN_VOICE_4959: precise, calm, concrete.';
export const PRODUCTION_TURN_DECOY =
  'OTHER_BRAND_FEEDBACK_4959: never expose this memory.';
export const PRODUCTION_TURN_FOREIGN_MEMORY =
  'FOREIGN_TENANT_FEEDBACK_4959: never expose this tenant.';
export const PRODUCTION_TURN_TEXT = 'The next experiment is ready for review.';
type Scenario = 'text' | 'provider-failure' | 'draft';
type Actor = {
  organizationId: string;
  userId: string;
  brandId: string;
  strategyId: string;
};

type DispatchLockProof = { pid: number; backendStart: string; key: string };
type RuntimeBarrier = ReturnType<typeof runtimeBarrier>;
function runtimeBarrier() {
  let resume: () => void = () => {
    throw new Error('Uninitialized barrier');
  };
  let signal: () => void = () => {
    throw new Error('Uninitialized barrier');
  };
  const resumed = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    signal = resolve;
  });
  return {
    entered,
    resume,
    wait: async () => {
      signal();
      await resumed;
    },
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Guards are installed before importing production modules: SDKs must not capture
// an unguarded transport. Database and broker sockets are real and loopback-only.
async function isolatedTransports(databaseUrl: string, redisUrl: string) {
  const prohibited: string[] = [];
  const sockets = new Set<net.Socket>();
  const reject = (target: string): never => {
    prohibited.push(target);
    throw new Error(`Unexpected production-turn transport: ${target}`);
  };
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/v1/health') {
      prohibited.push(`peer ${request.method} ${request.url}`);
      response.writeHead(503).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ status: 'ok' }));
  });
  await new Promise<void>((resolve, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing peer address');
  const peerOrigin = `http://127.0.0.1:${address.port}`;
  const allowed = [
    new URL(databaseUrl),
    new URL(redisUrl),
    new URL(peerOrigin),
  ];
  const connect = net.Socket.prototype.connect;
  const socketSpy = vi
    .spyOn(net.Socket.prototype, 'connect')
    .mockImplementation(function (
      this: net.Socket,
      ...args: Parameters<net.Socket['connect']>
    ) {
      const first: unknown = args[0];
      const options = record(Array.isArray(first) ? first[0] : first);
      const port = Number(typeof first === 'number' ? first : options.port);
      const host =
        typeof args[1] === 'string'
          ? args[1]
          : String(options.host ?? 'localhost');
      if (
        !allowed.some(
          (url) =>
            ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) &&
            port ===
              Number(
                url.port || (url.protocol.startsWith('postgres') ? 5432 : 6379),
              ),
        )
      )
        reject(`socket ${host}:${port}`);
      sockets.add(this);
      this.once('close', () => sockets.delete(this));
      return Reflect.apply(connect, this, args) as net.Socket;
    });
  const assertHttp = (input: unknown, options: unknown = {}) => {
    const supplied = record(options);
    const requestOptions = record(input);
    const url =
      input instanceof URL
        ? input
        : typeof input === 'string'
          ? new URL(input)
          : new URL(
              `${requestOptions.protocol ?? 'http:'}//${requestOptions.hostname ?? requestOptions.host ?? 'localhost'}:${requestOptions.port ?? 80}${requestOptions.path ?? '/'}`,
            );
    const method = String(
      supplied.method ?? requestOptions.method ?? 'GET',
    ).toUpperCase();
    if (method !== 'GET' || url.href !== `${peerOrigin}/v1/health`)
      reject(`${method} ${url.origin}${url.pathname}`);
  };
  const request = http.request;
  const get = http.get;
  const requestSpy = vi
    .spyOn(http, 'request')
    .mockImplementation((...args: Parameters<typeof http.request>) => {
      assertHttp(args[0], args[1]);
      return Reflect.apply(request, http, args) as http.ClientRequest;
    });
  const getSpy = vi
    .spyOn(http, 'get')
    .mockImplementation((...args: Parameters<typeof http.get>) => {
      assertHttp(args[0], args[1]);
      return Reflect.apply(get, http, args) as http.ClientRequest;
    });
  const httpsRequest = vi
    .spyOn(https, 'request')
    .mockImplementation(() => reject('https.request'));
  const httpsGet = vi
    .spyOn(https, 'get')
    .mockImplementation(() => reject('https.get'));
  const fetch = globalThis.fetch;
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => {
      assertHttp(input instanceof Request ? input.url : input, {
        method:
          init?.method ?? (input instanceof Request ? input.method : 'GET'),
      });
      return fetch(input, { ...init, redirect: 'error' });
    });
  return {
    peerOrigin,
    assertClean: () =>
      deepStrictEqual(
        prohibited,
        [],
        'A caught outbound refusal still fails acceptance',
      ),
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolve())),
      );
      socketSpy.mockRestore();
      requestSpy.mockRestore();
      getSpy.mockRestore();
      httpsRequest.mockRestore();
      httpsGet.mockRestore();
      fetchSpy.mockRestore();
      deepStrictEqual(prohibited, [], 'Unexpected transport during teardown');
    },
  };
}

export async function createProactiveProductionTurnFixture() {
  if (process.env.PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB !== '1')
    throw new Error(
      'Production-turn acceptance requires a fixture-exclusive migrated database discarded after this focused run; set PROACTIVE_AGENT_PRODUCTION_TURN_EXCLUSIVE_DB=1 only when the owner establishes that lifecycle',
    );
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl)
    throw new Error(
      'Production-turn acceptance requires explicit disposable DATABASE_URL and REDIS_URL',
    );
  const database = new URL(databaseUrl);
  const broker = new URL(redisUrl);
  for (const url of [database, broker]) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Production-turn acceptance refuses remote resources');
  }
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    !/test/i.test(database.pathname) ||
    broker.protocol !== 'redis:'
  )
    throw new Error(
      'Production-turn acceptance requires a migrated test database and real Redis',
    );
  const namespace = `4959-production-${randomUUID()}`;
  const modelKey = `fixture/${namespace}`;
  const transports = await isolatedTransports(databaseUrl, redisUrl);
  let moduleRef: TestingModule | undefined;
  const cleanup = createProductionTurnCleanup();
  let dispatchControl: Client | undefined;
  const dispatchControlErrors: unknown[] = [];
  const dispatchBarriers = new Set<RuntimeBarrier>();
  const activeDispatches = new Set<Promise<Record<string, unknown>>>();
  let providerBarrier: RuntimeBarrier | undefined;
  const queues = new Map<string, Queue>();
  const events = new Map<string, QueueEvents>();
  const actors: Actor[] = [];
  const roleIds: string[] = [];
  const createdGlobalIds: { model?: string; platform?: string } = {};
  let prisma: PrismaService | undefined;
  let originalPlatform: Awaited<
    ReturnType<PrismaService['platformSetting']['findFirst']>
  >;
  let ownedMirrors: string[] = [];
  let createdSystemUser = false;
  let createdSystemOrganization = false;
  const observed: OpenRouterChatCompletionParams[] = [];
  const heldReservationIds: string[] = [];
  let currentActor: Actor | undefined;
  let scenario: Scenario = 'text';
  let scenarioCalls = 0;
  const providerSpies: Array<{ mockRestore(): void }> = [];
  const connection = {
    host: broker.hostname,
    port: Number(broker.port || 6379),
    db: Number(broker.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
  };
  const requiredStrings = [
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'INSTAGRAM_APP_ID',
    'INSTAGRAM_APP_SECRET',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
    'TWITTER_BEARER_TOKEN',
    'TWITTER_CLIENT_ID',
    'TWITTER_CLIENT_SECRET',
    'TWITTER_CONSUMER_KEY',
    'TWITTER_CONSUMER_SECRET',
    'REPLICATE_KEY',
    'REPLICATE_WEBHOOK_SIGNING_SECRET',
    'KLINGAI_KEY',
    'KLINGAI_SECRET',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_MODEL',
    'LEONARDO_KEY',
    'HEYGEN_KEY',
    'ARGIL_WEBHOOK_SECRET',
    'NEWS_API_KEY',
  ] as const;
  const ownedUrlKeys = [
    'GENFEEDAI_API_PUBLIC_URL',
    'GENFEEDAI_API_URL',
    'GENFEEDAI_APP_URL',
    'GENFEEDAI_CDN_URL',
    'GENFEEDAI_MCP_PUBLIC_URL',
    'GENFEEDAI_WEBHOOKS_URL',
    'GENFEEDAI_MICROSERVICES_FILES_URL',
    'GENFEEDAI_MICROSERVICES_MCP_URL',
    'GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL',
    'YOUTUBE_REDIRECT_URI',
    'INSTAGRAM_GRAPH_URL',
    'INSTAGRAM_REDIRECT_URI',
    'FACEBOOK_GRAPH_URL',
    'FACEBOOK_REDIRECT_URI',
    'TWITTER_REDIRECT_URI',
    'NEWS_API_URL',
  ] as const;
  const inertStrings = {
    TOKEN_ENCRYPTION_KEY: 'test-encryption-key-for-testing-only',
    BETTER_AUTH_SECRET: 'production-turn-fixture-session-secret-only',
    GENFEEDAI_API_KEY: 'production-turn-fixture-internal-only',
    AWS_ACCESS_KEY_ID: 'production-turn-fixture-access',
    AWS_SECRET_ACCESS_KEY: 'production-turn-fixture-secret',
    AWS_REGION: 'us-east-1',
    AWS_S3_BUCKET: 'production-turn-fixture-unused',
    STRIPE_SECRET_KEY: 'sk_test_production_turn_unused',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_production_turn_unused',
    STRIPE_WEBHOOK_SIGNING_SECRET: 'whsec_production_turn_unused',
    STRIPE_PRICE_PAYG: 'price_productionturnunused',
    SENTRY_ENVIRONMENT: 'test',
    SENTRY_DSN: 'http://00000000000000000000000000000000@127.0.0.1:1/1',
    INSTAGRAM_API_VERSION: 'v22.0',
    FACEBOOK_API_VERSION: 'v22.0',
    OPENROUTER_API_KEY: 'test-production-turn-transport-only',
  } as const;
  const setEnvironment = async () => {
    const cwd = process.cwd();
    const fromServer = cwd.endsWith('apps/server');
    for (const filename of [
      resolve(cwd, fromServer ? '../../.env.test' : '.env.test'),
      resolve(cwd, fromServer ? 'api/.env.test' : 'apps/server/api/.env.test'),
    ]) {
      try {
        await lstat(filename);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          continue;
        throw error;
      }
      throw new Error('Production-turn refuses an existing configuration file');
    }
    const plumbing = new Set([
      'PATH',
      'HOME',
      'USER',
      'TMPDIR',
      'TMP',
      'TEMP',
      'SYSTEMROOT',
      'WINDIR',
      'COMSPEC',
      'PATHEXT',
      'VITEST',
      'VITEST_POOL_ID',
      'VITEST_WORKER_ID',
      'FORCE_COLOR',
      'NO_COLOR',
    ]);
    for (const key of Object.keys(process.env))
      if (!plumbing.has(key)) vi.stubEnv(key, undefined);
    const environment: NodeJS.ProcessEnv = {
      ...inertStrings,
      CI: 'true',
      NODE_ENV: 'test',
      TZ: 'UTC',
      GENFEED_CLOUD: 'true',
      NEXT_PUBLIC_GENFEED_CLOUD: 'true',
      PORT: '3001',
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      REDIS_DRIVER: 'redis',
      REDIS_TLS: 'false',
      BETTER_AUTH_ENABLED: 'true',
      AWS_EC2_METADATA_DISABLED: 'true',
      SENTRY_ENABLED: 'false',
      AWS_SHARED_CREDENTIALS_FILE: resolve(
        tmpdir(),
        `${namespace}-absent-aws-credentials`,
      ),
      AWS_CONFIG_FILE: resolve(tmpdir(), `${namespace}-absent-aws-config`),
      CRUN_ENABLED: 'false',
      VISUAL_CODE_RENDERER_ENABLED: 'false',
    };
    for (const key of requiredStrings)
      environment[key] = 'production-turn-fixture-unused';
    for (const key of ownedUrlKeys) environment[key] = transports.peerOrigin;
    for (const workload of ['QUEUE', 'CACHE', 'RATELIMIT', 'SOCKET']) {
      environment[`REDIS_${workload}_URL`] = redisUrl;
      environment[`REDIS_${workload}_DB`] = String(connection.db);
    }
    for (const [key, value] of Object.entries(environment))
      vi.stubEnv(key, value);
    for (const key of ['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE']) {
      const filename = environment[key];
      if (!filename) throw new Error('Missing fixture AWS file boundary');
      try {
        await lstat(filename);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        )
          continue;
        throw error;
      }
      throw new Error('Production-turn AWS resource path already exists');
    }
  };
  try {
    await setEnvironment();
    vi.resetModules();
    const [
      { Test },
      { getQueueToken },
      { ModulesContainer },
      { EventEmitterModule },
      { AgentOrchestratorModule },
      { WorkflowsModule },
      { WorkflowExecutionsModule },
      { IngredientsModule },
      { ReplicateModule },
      { ByokModule },
      { WebhooksMediaModule },
      { ConfigModule },
      { ConfigService },
      { LoggerModule },
      { PrismaModule },
      { PrismaService: PrismaToken },
      { CacheModule },
      { CacheService },
      { CacheClientService },
      { RedisModule },
      { RedisService },
      { PlatformSystemWorkflowProcessor },
      { AgentTurnWorkflowProcessor },
      { PlatformWorkflowSchedulesService },
      { WorkflowContinuationReconcileService },
      { PendingWorkflowExecutionReconcileService },
      { AgentTurnWorkflowExecutionService },
      { AgentOrchestratorContextService },
      { AgentOrchestratorStreamLoopService },
      { AgentTurnRoundRunnerService },
      { AgentToolMutationAuthorizationService },
      { CreditsUtilsService },
      { BillingAccountsService },
      { AgentStrategiesService },
      { AgentMemoriesService },
      { AgentAutopilotWorkflowService },
      { AgentChatModelRegistryService },
      { LlmDispatcherService },
      { OpenRouterService },
      { SystemWorkflowRunnerService },
      { WorkflowExecutorService },
      { WorkflowEngineAdapterService },
      workflowTokens,
      contracts,
      constants,
      queueNames,
      seed,
    ] = await Promise.all([
      import('@nestjs/testing'),
      import('@nestjs/bullmq'),
      import('@nestjs/core'),
      import('@nestjs/event-emitter'),
      import('@api/services/agent-orchestrator/agent-orchestrator.module'),
      import('@api/collections/workflows/workflows.module'),
      import('@api/collections/workflow-executions/workflow-executions.module'),
      import('@api/collections/ingredients/ingredients.module'),
      import('@api/services/integrations/replicate/replicate.module'),
      import('@api/services/byok/byok.module'),
      import('@api/endpoints/webhooks/webhooks-media.module'),
      import('@libs/config/config.module'),
      import('@libs/config/config.service'),
      import('@libs/logger/logger.module'),
      import('@api/shared/modules/prisma/prisma.module'),
      import('@api/shared/modules/prisma/prisma.service'),
      import('@api/services/cache/cache.module'),
      import('@api/services/cache/cache.service'),
      import('@api/services/cache/cache-client.service'),
      import('@libs/redis/redis.module'),
      import('@libs/redis/redis.service'),
      import(
        '@workers/processors/api/collections/workflows/services/platform-system-workflow.processor'
      ),
      import(
        '@workers/processors/api/collections/workflows/services/agent-turn-workflow.processor'
      ),
      import('@workers/scheduling/platform-workflow-schedules.service'),
      import('@workers/scheduling/workflow-continuation-reconcile.service'),
      import(
        '@workers/scheduling/pending-workflow-execution-reconcile.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-turn-workflow-execution.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-context.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-stream-loop.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-turn-round-runner.service'
      ),
      import(
        '@api/services/agent-orchestrator/tools/agent-tool-mutation-authorization.service'
      ),
      import('@api/collections/credits/services/credits.utils.service'),
      import(
        '@api/collections/billing-accounts/services/billing-accounts.service'
      ),
      import(
        '@api/collections/agent-strategies/services/agent-strategies.service'
      ),
      import('@api/collections/agent-memories/services/agent-memories.service'),
      import(
        '@api/collections/workflows/services/agent-autopilot-workflow.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-chat-model-registry.service'
      ),
      import('@api/services/integrations/llm/llm-dispatcher.service'),
      import(
        '@api/services/integrations/openrouter/services/openrouter.service'
      ),
      import('@api/collections/workflows/system-workflow-runner.service'),
      import('@api/collections/workflows/services/workflow-executor.service'),
      import(
        '@api/collections/workflows/services/workflow-engine-adapter.service'
      ),
      import('@api/collections/workflows/workflows.tokens'),
      import('@genfeedai/contracts'),
      import('@genfeedai/contracts/constants'),
      import('@genfeedai/contracts/queue'),
      import('@api-test/e2e/e2e-test.utils'),
    ]);
    const builder = Test.createTestingModule({
      imports: [
        ConfigModule,
        LoggerModule,
        PrismaModule,
        CacheModule,
        RedisModule.forRoot({
          configModule: ConfigModule,
          configService: ConfigService,
        }),
        EventEmitterModule.forRoot(),
        AgentOrchestratorModule,
        WorkflowsModule,
        WorkflowExecutionsModule,
        IngredientsModule,
        ReplicateModule,
        ByokModule,
        WebhooksMediaModule,
      ],
      providers: [
        PlatformSystemWorkflowProcessor,
        AgentTurnWorkflowProcessor,
        PlatformWorkflowSchedulesService,
        WorkflowContinuationReconcileService,
        PendingWorkflowExecutionReconcileService,
      ],
    });
    // All producers remain real; overrides are real UUID-owned Bull queues.
    for (const name of [
      ...queueNames.ALL_QUEUE_NAMES,
      queueNames.LLM_COST_SETTLEMENT_QUEUE,
      queueNames.MEDIA_DELIVERY_QUEUE,
    ]) {
      const attempts = new Set<string>([
        queueNames.AGENT_TURN_QUEUE,
        queueNames.WORKFLOW_EXECUTION_QUEUE,
      ]).has(name)
        ? 1
        : 3;
      const queue = new Queue(name, {
        connection,
        prefix: namespace,
        defaultJobOptions: {
          attempts,
          backoff: { delay: 5000, type: 'exponential' },
          removeOnComplete: 200,
          removeOnFail: 100,
        },
      });
      queues.set(name, queue);
      builder.overrideProvider(getQueueToken(name)).useValue(queue);
    }
    for (const [key, value] of [
      ['GOOGLE_OAUTH_CLIENT_SECRET', undefined],
      ['TOKEN_ENCRYPTION_KEY', 'short'],
    ] as const) {
      const original = process.env[key];
      vi.stubEnv(key, value);
      try {
        let rejected = false;
        try {
          new ConfigService();
        } catch (error) {
          rejected =
            error instanceof Error &&
            error.message.startsWith('Config validation error:') &&
            error.message.includes(key);
        }
        strictEqual(
          rejected,
          true,
          `Real cloud configuration must reject invalid ${key}`,
        );
      } finally {
        vi.stubEnv(key, original);
      }
    }
    cleanup.beginConstruction();
    moduleRef = await builder.compile();
    const module = moduleRef;
    cleanup.registerWriterStop(() => module.close());
    const config = module.get(ConfigService);
    const { isCloudTenantGuardEnabled } = await import(
      '@libs/prisma/prisma.service'
    );
    const assertConfiguration = () => {
      strictEqual(config.constructor, ConfigService);
      strictEqual(config instanceof ConfigService, true);
      strictEqual(module.get(ConfigService), config);
      strictEqual(config.isTest, true);
      strictEqual(config.get('PORT'), 3001);
      for (const [key, value] of Object.entries(inertStrings))
        strictEqual(config.get(key), value);
      for (const key of requiredStrings)
        strictEqual(config.get(key), 'production-turn-fixture-unused');
      for (const key of ownedUrlKeys)
        strictEqual(config.get(key), transports.peerOrigin);
      strictEqual(
        (config.get('TOKEN_ENCRYPTION_KEY') ?? '').length >= 32,
        true,
      );
      strictEqual(
        isCloudTenantGuardEnabled((key) => {
          const value: unknown = config.get(key);
          return typeof value === 'string' ? value : undefined;
        }),
        true,
      );
      strictEqual(config.mediaUrlConfig.signing, undefined);
      for (const key of [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'FAL_API_KEY',
        'MUREKA_API_KEY',
        'HEDRA_KEY',
        'TYPESAFE_API_KEY',
        'CONTENT_EVAL_GENFEED_API_KEY',
        'REPLICATE_API_TOKEN',
        'ARGIL_KEY',
        'TELEGRAM_BOT_TOKEN',
        'GENFEED_LICENSE_KEY',
      ] as const)
        strictEqual(process.env[key], undefined);
    };
    assertConfiguration();
    const db = module.get<PrismaService>(PrismaToken);
    if (!db) throw new Error('Production-turn Prisma provider is unavailable');
    prisma = db;
    await db.$connect();
    // This module boots the actual scheduler. Unrelated tenant schedules are not
    // permitted in its dedicated database; no global database clear is used.
    const { SYSTEM_WORKFLOW_PRINCIPAL_ID } = await import(
      '@api/collections/workflows/system-workflow.contract'
    );
    strictEqual(
      await db.organization.count({
        where: { id: { not: SYSTEM_WORKFLOW_PRINCIPAL_ID }, isDeleted: false },
      }),
      0,
      'Use a dedicated migrated database, without unrelated tenants',
    );
    const initialMirrors = await db.workflow.findMany({
      where: { organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID, isDeleted: false },
      select: { id: true },
    });
    ownedMirrors = initialMirrors.map((row) => row.id);
    if (
      !(await db.user.findUnique({
        where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
      }))
    ) {
      await db.user.create({
        data: seed.createTestUser({
          id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          email: `${namespace}-system@example.test`,
          handle: `${namespace}-system`,
        }),
      });
      createdSystemUser = true;
    }
    if (
      !(await db.organization.findUnique({
        where: { id: SYSTEM_WORKFLOW_PRINCIPAL_ID },
      }))
    ) {
      await db.organization.create({
        data: seed.createTestOrganization({
          id: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          slug: `${namespace}-system`,
        }),
      });
      createdSystemOrganization = true;
    }
    const model = await db.model.create({
      data: {
        key: modelKey,
        label: namespace,
        endpoint: 'https://provider.example.test',
        category: contracts.ModelCategory.TEXT,
        provider: contracts.ModelProvider.OPENROUTER,
        capabilities: [constants.AGENT_CHAT_CAPABILITY],
        recommendedFor: [constants.AGENT_CHAT_CAPABILITY],
        lifecycle: contracts.ModelLifecycle.AVAILABLE,
        isActive: true,
        isDefault: true,
        isFree: false,
        cost: 1,
        inputCostPerMillionTokens: 1,
        outputCostPerMillionTokens: 2,
      },
    });
    createdGlobalIds.model = model.id;
    originalPlatform = await db.platformSetting.findFirst({
      where: { key: 'platform', isDeleted: false },
    });
    const platform = await db.platformSetting.upsert({
      where: { key: 'platform' },
      create: {
        key: 'platform',
        isAgentTokenStreamingEnabled: false,
        marginMultiplierAgentChat: 1.7,
      },
      update: {
        isAgentTokenStreamingEnabled: false,
        marginMultiplierAgentChat: 1.7,
      },
    });
    if (!originalPlatform) createdGlobalIds.platform = platform.id;
    const dependencyModules = await Promise.all([
      import('@api/collections/settings/services/settings.service'),
      import('@api/collections/agent-threads/services/agent-threads.service'),
      import('@api/collections/agent-messages/services/agent-messages.service'),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-plan-mode.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-batch.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-recurring-task.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-sync-loop.service'
      ),
      import(
        '@api/services/agent-orchestrator/agent-orchestrator-ui-action.service'
      ),
      import('@api/services/agent-orchestrator/agent-stream-effects.service'),
      import(
        '@api/services/agent-orchestrator/agent-thread-event-recorder.service'
      ),
      import(
        '@api/services/agent-threading/services/agent-execution-lane.service'
      ),
      import(
        '@api/services/agent-threading/services/agent-runtime-session.service'
      ),
    ]);
    const dependencyTokens = [
      PrismaToken,
      CreditsUtilsService,
      AgentChatModelRegistryService,
      AgentOrchestratorContextService,
      AgentOrchestratorStreamLoopService,
      SystemWorkflowRunnerService,
      ...dependencyModules.map((dependency) =>
        Object.values(dependency).find(
          (value) =>
            typeof value === 'function' && value.name.endsWith('Service'),
        ),
      ),
    ];
    const assertPrismaProvider = async () => {
      const [
        { PrismaService: LibsPrismaToken },
        { getTenantContext, runWithTenantContext },
        { TenantIsolationError },
      ] = await Promise.all([
        import('@libs/prisma/prisma.service'),
        import('@libs/prisma/tenant-context'),
        import('@libs/prisma/tenant-guard'),
      ]);
      strictEqual(module.get(PrismaToken), db);
      strictEqual(module.get(LibsPrismaToken), db);
      const prismaModules = [...module.get(ModulesContainer).values()].filter(
        (entry) => entry.metatype === PrismaModule,
      );
      strictEqual(prismaModules.length, 1);
      const provider = prismaModules[0].providers.get(PrismaToken);
      if (!provider) throw new Error('Missing actual Prisma module provider');
      strictEqual(provider.metatype, PrismaToken);
      strictEqual(provider.isAlias, false);
      strictEqual(provider.instance, db);
      assertConfiguration();
      const organizationId = randomUUID();
      const differentOrganizationId = randomUUID();
      await rejects(
        async () =>
          runWithTenantContext({ organizationId }, async () => {
            strictEqual(getTenantContext()?.organizationId, organizationId);
            await db.post.findMany({
              where: {
                organizationId: differentOrganizationId,
                isDeleted: false,
              },
              take: 1,
            });
          }),
        (error: unknown) =>
          error instanceof TenantIsolationError &&
          error.reason === 'organization-id-mismatch',
      );
      const identity = await db.$queryRaw<
        { name: string }[]
      >`SELECT current_database() AS name`;
      strictEqual(identity.length, 1);
      strictEqual(
        identity[0].name,
        decodeURIComponent(database.pathname.slice(1)),
      );
    };
    strictEqual(dependencyTokens.length, 18);
    for (const token of dependencyTokens) {
      if (typeof token !== 'function')
        throw new Error('Missing production dependency token');
      const instance = module.get<unknown>(token);
      if (token === PrismaToken) {
        strictEqual(instance, db);
        await assertPrismaProvider();
        continue;
      }
      strictEqual(
        instance instanceof token,
        true,
        `Production dependency identity: ${token.name}`,
      );
    }
    const credits = module.get(CreditsUtilsService);
    strictEqual(
      credits.constructor,
      CreditsUtilsService,
      'Cloud fixture must use the actual metered credits implementation',
    );
    const turn = module.get(AgentTurnWorkflowExecutionService);
    const context = module.get(AgentOrchestratorContextService);
    const stream = module.get(AgentOrchestratorStreamLoopService);
    const rounds = module.get(AgentTurnRoundRunnerService);
    const authorizer = module.get(AgentToolMutationAuthorizationService);
    const processor = module.get(PlatformSystemWorkflowProcessor);
    const liveProcessor = module.get(AgentTurnWorkflowProcessor);
    const calls = {
      processor: vi.spyOn(processor, 'process'),
      liveProcessor: vi.spyOn(liveProcessor, 'process'),
      prepare: vi.spyOn(turn, 'prepare'),
      execute: vi.spyOn(turn, 'execute'),
      context: vi.spyOn(context, 'resolveSystemPromptAndModel'),
      stream: vi.spyOn(stream, 'runStreamLoop'),
      tools: vi.spyOn(rounds, 'executeToolRound'),
      authorize: vi.spyOn(authorizer, 'authorize'),
      reserve: vi.spyOn(credits, 'reserveCredits'),
      settle: vi.spyOn(credits, 'settleReservation'),
      release: vi.spyOn(credits, 'releaseReservation'),
    };
    const provider = module.get(OpenRouterService);
    providerSpies.push(
      vi
        .spyOn(provider, 'chatCompletion')
        .mockImplementation(
          async (
            params,
            apiKeyOverride,
          ): Promise<OpenRouterChatCompletionResponse> => {
            strictEqual(
              apiKeyOverride,
              undefined,
              'Fixture must not route through BYOK',
            );
            strictEqual(params.model, modelKey, 'Unexpected inferred model');
            if (!currentActor)
              throw new Error('Provider called outside the prepared actor');
            const held = await db.creditReservation.findMany({
              where: {
                organizationId: currentActor.organizationId,
                isDeleted: false,
                status: 'RESERVED',
                workloadType: 'agent-llm-round',
              },
            });
            strictEqual(
              held.length,
              1,
              'Actual hold must precede external inference',
            );
            if (held[0].amount <= 0)
              throw new Error('Real reservation must hold positive credits');
            heldReservationIds.push(held[0].id);
            observed.push(structuredClone(params));
            scenarioCalls++;
            if (providerBarrier) await providerBarrier.wait();
            if (scenario === 'provider-failure') {
              strictEqual(scenarioCalls, 1, 'Failed round was replayed');
              throw new Error('4959 scripted provider failure');
            }
            if (scenarioCalls > (scenario === 'draft' ? 2 : 1))
              throw new Error('Unexpected provider round');
            return {
              id: `${namespace}-${scenario}-${scenarioCalls}`,
              model: modelKey,
              choices: [
                {
                  finish_reason:
                    scenario === 'draft' && scenarioCalls === 1
                      ? 'tool_calls'
                      : 'stop',
                  message: {
                    role: 'assistant',
                    content:
                      scenario === 'draft' && scenarioCalls === 1
                        ? null
                        : PRODUCTION_TURN_TEXT,
                    ...(scenario === 'draft' && scenarioCalls === 1
                      ? {
                          tool_calls: [
                            {
                              id: `${namespace}-tool`,
                              type: 'function',
                              function: {
                                name: 'create_post',
                                arguments: JSON.stringify({
                                  content: PRODUCTION_TURN_TEXT,
                                  platforms: ['linkedin'],
                                }),
                              },
                            },
                          ],
                        }
                      : {}),
                  },
                },
              ],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 20,
                total_tokens: 120,
                cost: PRODUCTION_TURN_COST_USD,
                is_byok: false,
              },
            };
          },
        ),
    );
    const resolvedQueues = new Set<string>();
    for (const nestModule of module.get(ModulesContainer).values()) {
      for (const [token, wrapper] of nestModule.providers) {
        if (typeof token !== 'string' || !token.startsWith('BullQueue_'))
          continue;
        const queue: unknown = wrapper.instance;
        if (!(queue instanceof Queue))
          throw new Error(`Non-real queue ${token}`);
        strictEqual(queue.opts.prefix, namespace, token);
        deepStrictEqual(queue.opts.connection, connection, token);
        resolvedQueues.add(queue.name);
      }
    }
    for (const name of [
      queueNames.PLATFORM_SYSTEM_WORKFLOW_QUEUE,
      queueNames.AGENT_TURN_QUEUE,
      queueNames.LLM_COST_SETTLEMENT_QUEUE,
    ])
      strictEqual(resolvedQueues.has(name), true, `Missing real queue ${name}`);
    strictEqual(
      module.get(workflowTokens.WORKFLOW_EXECUTOR),
      module.get(WorkflowExecutorService),
    );
    strictEqual(
      module.get(workflowTokens.WORKFLOW_ENGINE_ADAPTER),
      module.get(WorkflowEngineAdapterService),
    );
    strictEqual(
      module.get(workflowTokens.SYSTEM_WORKFLOW_RUNNER),
      module.get(SystemWorkflowRunnerService),
    );
    await module.init();
    await Promise.all([
      processor.worker.waitUntilReady(),
      liveProcessor.worker.waitUntilReady(),
    ]);
    strictEqual(processor.worker.opts.prefix, namespace);
    strictEqual(liveProcessor.worker.opts.prefix, namespace);
    const cache = module.get(CacheService);
    strictEqual(
      module.get(CacheClientService).isReady,
      true,
      'Cache must not fail open',
    );
    strictEqual(
      await cache.set(`${namespace}:readiness`, { ready: true }, { ttl: 30 }),
      true,
    );
    deepStrictEqual(await cache.get(`${namespace}:readiness`), { ready: true });
    const redis = module.get(RedisService);
    const channel = `${namespace}:readiness`;
    let resolveReceipt = () => {};
    const receipt = new Promise<void>((resolve) => {
      resolveReceipt = resolve;
    });
    await redis.subscribe(channel, (payload) => {
      if (record(payload).ready === true) resolveReceipt();
    });
    let readinessTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await redis.publish(channel, { ready: true });
      await Promise.race([
        receipt,
        new Promise<never>((_, rejectTimeout) => {
          readinessTimer = setTimeout(
            () =>
              rejectTimeout(new Error('Real Redis pub/sub readiness failed')),
            3000,
          );
        }),
      ]);
    } finally {
      if (readinessTimer) clearTimeout(readinessTimer);
      await redis.unsubscribe(channel);
    }
    transports.assertClean();
    const registry = module.get(AgentChatModelRegistryService);
    strictEqual(await registry.resolveModelKey(modelKey), modelKey);
    const dispatcher = module.get(LlmDispatcherService);
    let ownerRole = await db.role.findUnique({
      where: { key: contracts.MemberRole.OWNER },
    });
    if (!ownerRole) {
      ownerRole = await db.role.create({
        data: { key: contracts.MemberRole.OWNER, label: 'Owner' },
      });
      roleIds.push(ownerRole.id);
    }
    const roleId = ownerRole.id;
    const memories = module.get(AgentMemoriesService);
    const strategies = module.get(AgentStrategiesService);
    const foreign = {
      userId: randomUUID(),
      organizationId: randomUUID(),
      brandId: randomUUID(),
      strategyId: '',
    };
    actors.push(foreign);
    await db.user.create({
      data: seed.createTestUser({
        id: foreign.userId,
        email: `${foreign.userId}@example.test`,
        handle: foreign.userId,
      }),
    });
    await db.organization.create({
      data: seed.createTestOrganization({
        id: foreign.organizationId,
        userId: foreign.userId,
        slug: foreign.organizationId,
      }),
    });
    await db.brand.create({
      data: seed.createTestBrand({
        id: foreign.brandId,
        organizationId: foreign.organizationId,
        userId: foreign.userId,
        slug: foreign.brandId,
      }),
    });
    await memories.createMemory(foreign.userId, foreign.organizationId, {
      brandId: foreign.brandId,
      scope: contracts.KnowledgeMemoryScope.BRAND,
      content: PRODUCTION_TURN_FOREIGN_MEMORY,
      kind: 'instruction',
      contentType: 'generic',
      importance: 1,
      confidence: 1,
    });
    const seedActor = async (selectedScenario: Scenario) => {
      scenario = selectedScenario;
      scenarioCalls = 0;
      observed.length = 0;
      heldReservationIds.length = 0;
      for (const spy of Object.values(calls)) spy.mockClear();
      const userId = randomUUID();
      const organizationId = randomUUID();
      const brandId = randomUUID();
      const actor: Actor = { userId, organizationId, brandId, strategyId: '' };
      actors.push(actor);
      await db.user.create({
        data: seed.createTestUser({
          id: userId,
          email: `${userId}@example.test`,
          handle: userId,
        }),
      });
      await db.organization.create({
        data: seed.createTestOrganization({
          id: organizationId,
          userId,
          slug: organizationId,
        }),
      });
      await db.brand.create({
        data: seed.createTestBrand({
          id: brandId,
          organizationId,
          userId,
          slug: brandId,
          description: PRODUCTION_TURN_VOICE,
        }),
      });
      await db.member.create({
        data: seed.createTestMember({
          organizationId,
          userId,
          currentBrandId: brandId,
          roleId,
        }),
      });
      await db.organizationSetting.create({
        data: seed.createTestOrganizationSetting({
          organizationId,
          defaultModel: model.id,
          enabledModelIds: [model.id],
          subscriptionTier: 'pro',
        }),
      });
      await db.subscription.create({
        data: {
          organizationId,
          userId,
          plan: contracts.SubscriptionPlan.MONTHLY,
          currentPeriodStart: new Date(Date.now() - 60_000),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600_000),
        },
      });
      await module
        .get(BillingAccountsService)
        .ensureForOrganization({ organizationId, userId });
      await credits.addOrganizationCreditsWithExpiration(
        organizationId,
        5000,
        'test-seed',
        `${namespace} starting balance`,
        new Date(Date.now() + 30 * 24 * 3600_000),
      );
      await db.credential.create({
        data: seed.createTestCredential({
          organizationId,
          brandId,
          userId,
          platform: 'LINKEDIN',
          externalId: randomUUID(),
          externalHandle: '@4959-fixture',
        }),
      });
      const strategy = await strategies.create({
        organizationId,
        userId,
        brandId,
        label: `${namespace} ${selectedScenario}`,
        model: modelKey,
        skillSlugs: [],
        isActive: true,
        autonomyMode: contracts.AgentAutonomyMode.SUPERVISED,
        dailyCreditBudget: 100,
        weeklyCreditBudget: 500,
        topics: ['one concrete experiment'],
        platforms: [contracts.Platform.LINKEDIN],
        voice: PRODUCTION_TURN_VOICE,
      });
      actor.strategyId = strategy.id;
      currentActor = actor;
      await memories.createMemory(userId, organizationId, {
        brandId,
        scope: contracts.KnowledgeMemoryScope.BRAND,
        content: PRODUCTION_TURN_MEMORY,
        kind: 'instruction',
        contentType: 'generic',
        importance: 0.9,
        confidence: 0.9,
      });
      const decoyBrand = await db.brand.create({
        data: seed.createTestBrand({
          organizationId,
          userId,
          slug: `${brandId}-decoy`,
        }),
      });
      await memories.createMemory(userId, organizationId, {
        brandId: decoyBrand.id,
        scope: contracts.KnowledgeMemoryScope.BRAND,
        content: PRODUCTION_TURN_DECOY,
        kind: 'instruction',
        contentType: 'generic',
        importance: 1,
        confidence: 1,
      });
      deepStrictEqual(
        await dispatcher.getCompletionRoute(modelKey, organizationId),
        { modelKey, provider: 'openrouter', isByok: false, isAvailable: true },
      );
      return actor;
    };
    const dispatch = async (actor: Actor) => {
      const strategy = await db.agentStrategy.findFirstOrThrow({
        where: {
          id: actor.strategyId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      });
      const pending = module
        .get(AgentAutopilotWorkflowService)
        .dispatchProactiveStrategy({
          organizationId: actor.organizationId,
          item: strategy,
        });
      activeDispatches.add(pending);
      try {
        return await pending;
      } finally {
        activeDispatches.delete(pending);
      }
    };
    const waitForDispatch = async (actor: Actor, executionId: string) => {
      const queue = queues.get(queueNames.PLATFORM_SYSTEM_WORKFLOW_QUEUE);
      if (!queue) throw new Error('Missing actual platform queue');
      let queueEvent = events.get(queue.name);
      if (!queueEvent) {
        queueEvent = new QueueEvents(queue.name, {
          connection,
          prefix: namespace,
        });
        events.set(queue.name, queueEvent);
        await queueEvent.waitUntilReady();
      }
      const jobs = await queue.getJobs([
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      ]);
      const job = jobs.find(
        (candidate) =>
          record(record(candidate.data).systemRun).priorExecution &&
          record(record(record(candidate.data).systemRun).priorExecution)
            .executionId === executionId,
      );
      if (!job)
        throw new Error(
          `Accepted execution ${executionId} has no real Redis job`,
        );
      // A rejected worker is an observed failed run, not a fixture success.
      const outcome = await job.waitUntilFinished(queueEvent, 30_000).then(
        (value) => ({ value, error: null }),
        (error) => ({ value: null, error: String(error) }),
      );
      const execution = await db.workflowExecution.findFirstOrThrow({
        where: {
          id: executionId,
          organizationId: actor.organizationId,
          isDeleted: false,
        },
      });
      transports.assertClean();
      return { execution, outcome, job };
    };
    const run = async (actor: Actor) => {
      const dispatched = await dispatch(actor);
      if (typeof dispatched.executionId !== 'string')
        throw new Error(
          `Actual proactive dispatch refused: ${JSON.stringify(dispatched)}`,
        );
      return waitForDispatch(actor, dispatched.executionId);
    };
    const requireActor = (actor: Actor) => {
      if (!actors.includes(actor) || !actor.strategyId)
        throw new Error('Dispatch control refuses an unowned actor');
      return `agent-proactive-dispatch:${actor.organizationId}:${actor.strategyId}`;
    };
    const control = async () => {
      if (!dispatchControl) {
        const { Client } = await import('pg');
        dispatchControl = new Client({
          connectionString: databaseUrl,
          application_name: `${namespace}-dispatch-control`,
        });
        dispatchControl.on('error', (error) =>
          dispatchControlErrors.push(error),
        );
        await dispatchControl.connect();
      }
      if (dispatchControlErrors.length)
        throw new AggregateError(
          dispatchControlErrors,
          'Dispatch observer failed',
        );
      return dispatchControl;
    };
    const lockRows = async (actor: Actor) => {
      const key = requireActor(actor);
      return (
        await (
          await control()
        ).query<{ pid: number; backendStart: string }>(
          `
        SELECT a.pid, a.backend_start::text AS "backendStart"
        FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory' AND l.granted
          AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND l.classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::oid
          AND l.objid = (hashtextextended($1, 0) & 4294967295)::oid AND l.objsubid = 1
          AND a.datname = current_database() AND a.usename = current_user
          AND a.pid <> pg_backend_pid()`,
          [key],
        )
      ).rows.map((row) => ({ ...row, key }));
    };
    const observeDispatchLock = async (
      actor: Actor,
    ): Promise<DispatchLockProof> => {
      const rows = await lockRows(actor);
      if (rows.length !== 1)
        throw new Error(
          `Expected one fixture dispatch owner, received ${rows.length}`,
        );
      return rows[0];
    };
    const contendDispatchLock = async (actor: Actor) => {
      const key = requireActor(actor);
      const client = await control();
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [key],
      );
      const acquired = result.rows[0]?.acquired;
      if (typeof acquired !== 'boolean')
        throw new Error('Missing lock contender result');
      if (acquired) {
        const released = await client.query<{ released: boolean }>(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released',
          [key],
        );
        strictEqual(released.rows[0]?.released, true);
      }
      return acquired;
    };
    const terminateDispatchOwner = async (
      actor: Actor,
      proof: DispatchLockProof,
    ) => {
      strictEqual(proof.key, requireActor(actor));
      deepStrictEqual(await observeDispatchLock(actor), proof);
      const result = await (await control()).query<{ terminated: boolean }>(
        `
        SELECT pg_terminate_backend(a.pid) AS terminated
        FROM pg_stat_activity a
        WHERE a.pid = $2 AND a.backend_start::text = $3
          AND a.datname = current_database() AND a.usename = current_user
          AND a.pid <> pg_backend_pid() AND EXISTS (
            SELECT 1 FROM pg_locks l WHERE l.pid = a.pid AND l.locktype = 'advisory'
              AND l.granted AND l.objsubid = 1
              AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
              AND l.classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::oid
              AND l.objid = (hashtextextended($1, 0) & 4294967295)::oid
          )`,
        [proof.key, proof.pid, proof.backendStart],
      );
      strictEqual(result.rows.length, 1);
      strictEqual(result.rows[0].terminated, true);
      const end = Date.now() + 5000;
      while ((await lockRows(actor)).length) {
        if (Date.now() >= end)
          throw new Error('Owned dispatch backend did not release its lock');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    const pauseProvider = () => {
      if (providerBarrier) throw new Error('Provider barrier already active');
      const barrier = runtimeBarrier();
      providerBarrier = barrier;
      dispatchBarriers.add(barrier);
      return {
        entered: barrier.entered,
        resume: () => {
          barrier.resume();
          providerBarrier = undefined;
          dispatchBarriers.delete(barrier);
        },
      };
    };
    const pauseDispatch = async (phase: 'preparation' | 'accepted') => {
      const barrier = runtimeBarrier();
      dispatchBarriers.add(barrier);
      if (phase === 'accepted') {
        const runner = module.get(SystemWorkflowRunnerService);
        const enqueue = runner.enqueueWorkflow.bind(runner);
        const spy = vi
          .spyOn(runner, 'enqueueWorkflow')
          .mockImplementationOnce(async (...args) => {
            const result = await enqueue(...args);
            await barrier.wait();
            return result;
          });
        providerSpies.push(spy);
        return {
          entered: barrier.entered,
          resume: () => {
            barrier.resume();
            dispatchBarriers.delete(barrier);
          },
          restore: () => spy.mockRestore(),
        };
      }
      const { AgentStrategyAutopilotPerformanceService } = await import(
        '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service'
      );
      const performance = module.get(AgentStrategyAutopilotPerformanceService);
      const snapshot = performance.getPerformanceSnapshot.bind(performance);
      const spy = vi
        .spyOn(performance, 'getPerformanceSnapshot')
        .mockImplementationOnce(async (...args) => {
          const result = await snapshot(...args);
          await barrier.wait();
          return result;
        });
      providerSpies.push(spy);
      return {
        entered: barrier.entered,
        resume: () => {
          barrier.resume();
          dispatchBarriers.delete(barrier);
        },
        restore: () => spy.mockRestore(),
      };
    };
    const platformQueue = queues.get(queueNames.PLATFORM_SYSTEM_WORKFLOW_QUEUE);
    if (!platformQueue) throw new Error('Missing actual platform queue');
    return {
      module,
      prisma: db,
      namespace,
      modelKey,
      calls,
      observed,
      heldReservationIds,
      credits,
      registry,
      seedActor,
      run,
      dispatch,
      waitForDispatch,
      observeDispatchLock,
      contendDispatchLock,
      terminateDispatchOwner,
      pauseDispatch,
      pauseProvider,
      platformQueue,
      assertTransports: transports.assertClean,
      assertConfiguration,
      assertPrismaProvider,
      close,
    };
  } catch (error) {
    await close().catch((cleanupError) => {
      throw new AggregateError(
        [error, cleanupError],
        'Production DI/initialization and cleanup failed',
      );
    });
    throw error;
  }

  async function close() {
    await cleanup.close({
      beforeStop: [
        () => {
          for (const barrier of dispatchBarriers) barrier.resume();
          providerBarrier?.resume();
        },
        async () => {
          const settled = await Promise.allSettled([...activeDispatches]);
          const rejected = settled.flatMap((result) =>
            result.status === 'rejected' ? [result.reason] : [],
          );
          if (rejected.length)
            throw new AggregateError(
              rejected,
              'Production-turn dispatch drain failed',
            );
        },
      ],
      closeHandles: [
        async () => {
          if (dispatchControl) await dispatchControl.end();
        },
        () => {
          if (dispatchControlErrors.length)
            throw new AggregateError(
              dispatchControlErrors,
              'Production-turn dispatch control failed',
            );
        },
        ...[...events.values()].map((event) => () => event.close()),
        ...[...queues.values()].map((queue) => () => queue.close()),
        async () => {
          if (prisma) await prisma.$disconnect();
        },
      ],
      disposeOwned: [
        ...[...queues.values()].map((queue) => async () => {
          const handle = new Queue(queue.name, {
            connection,
            prefix: namespace,
          });
          const errors: unknown[] = [];
          try {
            await handle.obliterate({ force: false });
          } catch (error) {
            errors.push(error);
          }
          try {
            await handle.close();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length)
            throw new AggregateError(
              errors,
              'Production-turn owned queue disposal failed',
            );
        }),
        async () => {
          if (!prisma) return;
          const db = prisma;
          await db.$connect();
          const ids = actors.map((actor) => actor.organizationId);
          await db.agentStrategy.updateMany({
            where: { organizationId: { in: ids }, isDeleted: false },
            data: { isActive: false, isDeleted: true },
          });
          await db.organization.updateMany({
            where: { id: { in: ids }, isDeleted: false },
            data: { isDeleted: true },
          });
          await db.user.updateMany({
            where: {
              id: { in: actors.map((actor) => actor.userId) },
              isDeleted: false,
            },
            data: { isDeleted: true },
          });
          // Global seed rows are restored exactly; canonical mirrors remain real
          // production records on the disposable database for diagnostic evidence.
          if (originalPlatform)
            await db.platformSetting.update({
              where: { id: originalPlatform.id },
              data: {
                isAgentTokenStreamingEnabled:
                  originalPlatform.isAgentTokenStreamingEnabled,
                marginMultiplierAgentChat:
                  originalPlatform.marginMultiplierAgentChat,
              },
            });
          else if (createdGlobalIds.platform)
            await db.platformSetting.delete({
              where: { id: createdGlobalIds.platform },
            });
          if (createdGlobalIds.model)
            await db.model.update({
              where: { id: createdGlobalIds.model },
              data: { isDeleted: true, isActive: false, isDefault: false },
            });
          // Retained fixture-global ownership is explicit; never delete another
          // suite's shared principal, roles or workflow mirrors.
          console.info(
            'Production-turn retained disposable-database evidence',
            {
              namespace,
              organizationIds: ids,
              roleIds,
              initialMirrorIds: ownedMirrors,
              createdSystemUser,
              createdSystemOrganization,
            },
          );
        },
        async () => {
          if (prisma) await prisma.$disconnect();
        },
      ],
      restoreGuards: [
        ...providerSpies.map((spy) => () => {
          spy.mockRestore();
        }),
        () => transports.close(),
        () => vi.unstubAllEnvs(),
      ],
    });
  }
}
