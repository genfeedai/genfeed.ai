import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer, type ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import { ContextEmbeddingCoreModule } from '@api/collections/contexts/context-embedding-core.module';
import { ContextEmbeddingService } from '@api/collections/contexts/services/context-embedding.service';
import { ContextEmbeddingProviderService } from '@api/collections/contexts/services/context-embedding-provider.service';
import { ContextEmbeddingSweepService } from '@api/collections/contexts/services/context-embedding-sweep.service';
import { ContextEmbeddingWriteService } from '@api/collections/contexts/services/context-embedding-write.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeContentRetrievalService } from '@api/collections/contexts/services/knowledge-content-retrieval.service';
import { KnowledgeEmbeddingCompletionService } from '@api/collections/contexts/services/knowledge-embedding-completion.service';
import { MembersModule } from '@api/collections/members/members.module';
import { MembersService } from '@api/collections/members/services/members.service';
import { CacheService } from '@api/services/cache/cache.service';
import { CacheClientService } from '@api/services/cache/cache-client.service';
import { RouterService } from '@api/services/router/router.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedModule } from '@api/shared/shared.module';
import {
  acceptanceEnvironment,
  assertRealMigrationLedger,
  type ContextEmbeddingTransportBinding,
  closeContextEmbeddingResources,
  connectDedicated,
  dedicatedDatabaseUrl,
  deployRealMigrations,
  inspectContextEmbeddingTransport,
  verifyPgvector,
} from '@api-test/integration/context-embedding/context-embedding-migration.fixture';
import {
  CONTEXT_EMBEDDING_QUEUE,
  type ContextEmbeddingJobData,
  NOTIFICATION_DELIVERY_QUEUE,
} from '@genfeedai/contracts/queue';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import {
  BullModule,
  getQueueToken,
  getSharedConfigToken,
} from '@nestjs/bullmq';
import { ModulesContainer } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { ContextEmbeddingProcessor } from '@workers/processors/api/queues/context-embedding/context-embedding.processor';
import axios from 'axios';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const command = promisify(execFile);
export const TEST_MODEL = 'context-embedding-fixture-1024';
export const FIXTURE_VECTOR = Array.from({ length: 1024 }, (_, i) =>
  i === 0 ? 1 : 0,
);
type ProviderCall = {
  input: string;
  model: string;
  provider: unknown;
  authorization: string | undefined;
  originalPath: string;
};
type ProviderBehavior = {
  status?: number;
  vector?: number[];
  delayMs?: number;
  beforeResponse?: () => Promise<void>;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
export async function waitFor(
  check: () => Promise<boolean> | boolean,
  timeoutMs = 30000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!(await check())) {
    if (performance.now() >= deadline)
      throw new Error('Disposable embedding runtime condition timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class LoopbackEmbeddings {
  readonly calls: ProviderCall[] = [];
  readonly behaviors = new Map<string, ProviderBehavior>();
  readonly blocked = new Map<
    string,
    {
      received: ReturnType<typeof deferred<ProviderCall>>;
      release: ReturnType<typeof deferred<void>>;
    }
  >();
  readonly originalPaths: string[] = [];
  active = 0;
  maxActive = 0;
  aborted = 0;
  private readonly server = createServer(async (request, response) => {
    if (request.url !== '/api/v1/embeddings' || request.method !== 'POST') {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (
      typeof body.input !== 'string' ||
      body.model !== TEST_MODEL ||
      request.headers.authorization !== 'Bearer context-embedding-loopback-only'
    ) {
      response.writeHead(400).end();
      return;
    }
    const call = {
      input: body.input,
      model: body.model,
      provider: body.provider,
      authorization: request.headers.authorization,
      originalPath: this.originalPaths.shift() ?? '',
    };
    this.calls.push(call);
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      const block = this.blocked.get(body.input);
      if (block) {
        block.received.resolve(call);
        await Promise.race([block.release.promise, once(response, 'close')]);
        if (response.destroyed) {
          this.aborted++;
          return;
        }
      }
      const behavior = this.behaviors.get(body.input) ?? {};
      if (behavior.delayMs)
        await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
      await behavior.beforeResponse?.();
      this.respond(response, behavior);
    } catch {
      if (!response.destroyed) response.writeHead(500).end('fixture failure');
    } finally {
      this.active--;
    }
  });
  origin = '';

  private respond(response: ServerResponse, behavior: ProviderBehavior): void {
    if (response.destroyed) return;
    response.writeHead(behavior.status ?? 200, {
      'Content-Type': 'application/json',
    });
    response.end(
      JSON.stringify(
        behavior.status && behavior.status !== 200
          ? { error: { message: 'synthetic fixture rejection' } }
          : {
              data: [
                { index: 0, embedding: behavior.vector ?? FIXTURE_VECTOR },
              ],
            },
      ),
    );
  }
  hold(input: string) {
    const received = deferred<ProviderCall>();
    const release = deferred<void>();
    this.blocked.set(input, { received, release });
    return { received: received.promise, release: () => release.resolve() };
  }
  async open(): Promise<void> {
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Loopback fake provider failed to bind');
    this.origin = 'http://127.0.0.1:' + address.port;
  }
  http(): HttpService {
    const transport = axios.create({ proxy: false });
    transport.interceptors.request.use((config) => {
      const original = new URL(config.url ?? '');
      if (
        original.origin !== 'https://openrouter.ai' ||
        original.pathname !== '/api/v1/embeddings'
      )
        throw new Error(
          'Acceptance transport refuses every non-embedding or live-provider route',
        );
      this.originalPaths.push(original.pathname);
      config.url = this.origin + original.pathname;
      return config;
    });
    return new HttpService(transport);
  }
  releaseAll(): void {
    for (const block of this.blocked.values()) block.release.resolve();
  }
  async close(): Promise<void> {
    if (!this.server.listening) return;
    for (const block of this.blocked.values()) block.release.resolve();
    this.server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      this.server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

export interface EmbeddingWorld {
  organizationId: string;
  brandId: string;
  otherBrandId: string;
  ownerId: string;
  otherUserId: string;
  memberId: string;
  actor: WorkflowInitiatingActor;
  baseId: string;
}

export interface ContextEmbeddingCleanupReceipt {
  startupCompleted: boolean;
  redisPrefix: string;
  redisNamespaceAttempted: boolean;
  redisKeysRemaining: number | null;
  applicationClosed: boolean | null;
  databaseClientDisconnected: boolean | null;
  loopbackServerClosed: boolean | null;
  queuesClosed: number | null;
}

export const UNAVAILABLE_EMBEDDING_CACHE_TRANSPORT = Object.freeze({
  isReady: false,
  get instance(): never {
    throw new Error(
      'Unexpected raw access to unavailable ancillary cache transport',
    );
  },
});

export interface ContextEmbeddingQueueBinding
  extends ContextEmbeddingTransportBinding {
  token: string;
  name: string;
}

export class ContextEmbeddingRuntime {
  static readonly applicationImports = Object.freeze([
    SharedModule,
    ContextEmbeddingCoreModule,
  ]);
  readonly actualQueues = new Set<Queue>();
  readonly queueContainment: ContextEmbeddingQueueBinding[] = [];
  workerContainment?: ContextEmbeddingTransportBinding;
  ancillaryCacheMode?: string;
  ancillaryPubsubMode?: string;
  private applicationConstructionAttempted = false;
  readonly prefix = 'context-embedding-acceptance-' + randomUUID();
  readonly transport = new LoopbackEmbeddings();
  readonly events: Array<{ message: string; fields: unknown }> = [];
  readonly logger = {
    log: (message: string, fields?: unknown) => {
      this.events.push({ message, fields });
    },
    debug: (_message: string, _fields?: unknown) => {},
    warn: (_message: string, _fields?: unknown) => {},
    error: (_message: string, _fields?: unknown) => {},
  } as unknown as LoggerService;
  readonly redisUrl: URL;
  readonly redis: Redis;
  readonly db: PrismaService;
  app!: TestingModule;
  environment!: Awaited<ReturnType<typeof acceptanceEnvironment>>;
  pgvectorVersion = '';
  migrationCount = 0;
  migrationInventory: Awaited<ReturnType<typeof assertRealMigrationLedger>> =
    [];
  redisOutageExpected = false;
  readonly unexpectedQueueErrors: string[] = [];
  private readonly config: ConfigService;
  startupCompleted = false;
  private namespaceAttempted = false;
  private databaseConnectionAttempted = false;
  private transportOpenAttempted = false;
  private closing?: Promise<ContextEmbeddingCleanupReceipt>;

  constructor() {
    const redisUrl = process.env.CONTEXT_EMBEDDING_REDIS_URL;
    if (!redisUrl)
      throw new Error(
        'CONTEXT_EMBEDDING_REDIS_URL is required; REDIS_URL is never a fallback',
      );
    this.redisUrl = new URL(redisUrl);
    if (
      this.redisUrl.protocol !== 'redis:' ||
      !['localhost', '127.0.0.1'].includes(this.redisUrl.hostname) ||
      !['', '/0'].includes(this.redisUrl.pathname) ||
      this.redisUrl.username ||
      this.redisUrl.password
    )
      throw new Error(
        'Acceptance Redis must be the dedicated loopback test service database zero',
      );
    const values: Record<string, string> = {
      DATABASE_URL: dedicatedDatabaseUrl('runtime'),
      NODE_ENV: 'test',
      GENFEED_CLOUD: 'true',
      OPENROUTER_API_KEY: 'context-embedding-loopback-only',
      REDIS_QUEUE_URL: this.redisUrl.toString(),
      REDIS_QUEUE_DB: '0',
      REDIS_CACHE_URL: this.redisUrl.toString(),
      REDIS_CACHE_DB: '0',
      REDIS_HOST: this.redisUrl.hostname,
      REDIS_PORT: this.redisUrl.port || '6379',
    };
    this.config = {
      get: (key: string) => values[key],
      mediaUrlConfig: { cdnUrl: 'https://fixture.test' },
    } as unknown as ConfigService;
    this.db = new PrismaService(this.config);
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  async open(): Promise<void> {
    try {
      this.environment = await acceptanceEnvironment();
      await deployRealMigrations('runtime');
      const identity = await connectDedicated('runtime');
      try {
        this.migrationInventory = await assertRealMigrationLedger(identity);
        this.migrationCount = this.migrationInventory.length;
        this.pgvectorVersion = await verifyPgvector(identity);
      } finally {
        await identity.end();
      }
      await this.redis.connect();
      if (!/^redis_version:7\./m.test(await this.redis.info('server')))
        throw new Error('Real Redis 7 is required');
      this.namespaceAttempted = true;
      await this.redis.set(
        this.prefix + ':owner',
        this.environment.candidateSHA,
        'NX',
      );
      this.transportOpenAttempted = true;
      await this.transport.open();
      await this.startWorker();
      this.startupCompleted = true;
    } catch (error) {
      await closeContextEmbeddingResources(
        [
          async () => {
            await this.close();
          },
        ],
        error,
      );
    }
  }
  async startWorker(): Promise<void> {
    this.databaseConnectionAttempted = true;
    await this.db.$connect();
    const connection = {
      host: this.redisUrl.hostname,
      port: Number(this.redisUrl.port || '6379'),
      db: 0,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    };
    this.applicationConstructionAttempted = true;
    this.app = await Test.createTestingModule({
      imports: [
        BullModule.forRoot({ prefix: this.prefix, connection }),
        ...ContextEmbeddingRuntime.applicationImports,
      ],
      providers: [ContextEmbeddingProcessor],
    })
      .overrideProvider(getSharedConfigToken())
      .useValue({ prefix: this.prefix, connection })
      .overrideProvider(CacheClientService)
      .useValue(UNAVAILABLE_EMBEDDING_CACHE_TRANSPORT)
      .overrideProvider(ConfigService)
      .useValue(this.config)
      .overrideProvider(PrismaService)
      .useValue(this.db)
      .overrideProvider(LoggerService)
      .useValue(this.logger)
      .overrideProvider(RouterService)
      .useValue({ getDefaultModel: async () => TEST_MODEL })
      .overrideProvider(HttpService)
      .useValue(this.transport.http())
      .compile();
    const recordQueueError = (error: Error) => {
      if (!this.redisOutageExpected)
        this.unexpectedQueueErrors.push(error.name);
    };
    const names = new Set<string>();
    const currentQueues = new Set<Queue>();
    for (const module of this.app.get(ModulesContainer).values()) {
      for (const [token, wrapper] of module.providers) {
        const instance: unknown = wrapper.instance;
        if (
          typeof token === 'string' &&
          token.startsWith('BullQueue_') &&
          !(instance instanceof Queue)
        )
          throw new Error('Non-real queue provider ' + token);
        if (!(instance instanceof Queue)) continue;
        this.actualQueues.add(instance);
        currentQueues.add(instance);
        const binding = inspectContextEmbeddingTransport(
          instance.opts.connection,
          instance.opts.prefix,
          this.redisUrl,
          this.prefix,
        );
        this.queueContainment.push({
          token: String(token),
          name: instance.name,
          ...binding,
        });
        names.add(instance.name);
        instance.on('error', recordQueueError);
      }
    }
    if (
      !names.has(CONTEXT_EMBEDDING_QUEUE) ||
      !names.has(NOTIFICATION_DELIVERY_QUEUE)
    )
      throw new Error(
        'Embedding and notification delivery queues must both be real and contained',
      );
    await Promise.all(
      [...currentQueues].map((queue) => queue.waitUntilReady()),
    );
    if (
      this.app.get<unknown>(CacheClientService) !==
        UNAVAILABLE_EMBEDDING_CACHE_TRANSPORT ||
      !(this.app.get(CacheService) instanceof CacheService) ||
      !(this.app.get(MembersService) instanceof MembersService)
    )
      throw new Error(
        'Real cache-miss and membership service composition required',
      );
    this.ancillaryCacheMode =
      'unavailable-transport; real cache-miss data and authorization';
    const imports: unknown = Reflect.getMetadata('imports', SharedModule);
    if (!Array.isArray(imports) || !imports.includes(MembersModule))
      throw new Error('Actual SharedModule membership ownership required');
    await this.app.init();
    const worker = this.app.get(ContextEmbeddingProcessor).worker;
    worker.on('error', recordQueueError);
    await worker.waitUntilReady();
    this.workerContainment = inspectContextEmbeddingTransport(
      worker.opts.connection,
      worker.opts.prefix,
      this.redisUrl,
      this.prefix,
    );
    if (this.app.get(RedisService).getPublisher() !== null)
      throw new Error(
        'Ancillary pubsub must remain disabled by absent base Redis URL',
      );
    this.ancillaryPubsubMode =
      'disabled by absent base Redis URL; no pubsub parity evidence';
  }

  get writer() {
    return this.app.get(ContextEmbeddingWriteService);
  }
  get execution() {
    return this.app.get(ContextEmbeddingService);
  }
  get sweep() {
    return this.app.get(ContextEmbeddingSweepService);
  }
  get completion() {
    return this.app.get(KnowledgeEmbeddingCompletionService);
  }
  get provider() {
    return this.app.get(ContextEmbeddingProviderService);
  }
  get queue(): Queue<ContextEmbeddingJobData> {
    return this.app.get(getQueueToken(CONTEXT_EMBEDDING_QUEUE));
  }
  get contexts() {
    return new ContextsService(
      this.db,
      this.logger,
      this.provider,
      this.writer,
    );
  }
  get retrieval() {
    return new KnowledgeContentRetrievalService(
      this.db,
      this.contexts,
      this.app.get(BrandAccessService),
    );
  }

  async restartWorker(): Promise<void> {
    await this.app.close();
    await this.startWorker();
  }
  async stopWorker(): Promise<void> {
    await this.app.get(ContextEmbeddingProcessor).worker.close();
  }

  async world(): Promise<EmbeddingWorld> {
    const suffix = randomUUID();
    const ownerId = 'embedding-owner-' + suffix;
    const otherUserId = 'embedding-other-' + suffix;
    for (const id of [ownerId, otherUserId])
      await this.db.user.create({ data: { id, handle: id } });
    const role = await this.db.role.upsert({
      where: { key: 'owner' },
      create: { key: 'owner', label: 'Owner' },
      update: {},
    });
    const billingAccount = await this.db.billingAccount.create({ data: {} });
    const organization = await this.db.organization.create({
      data: {
        label: suffix,
        slug: 'embedding-' + suffix,
        userId: ownerId,
        billingAccountId: billingAccount.id,
      },
    });
    const organizationId = organization.id;
    const brand = await this.db.brand.create({
      data: {
        label: suffix,
        slug: 'embedding-' + suffix,
        organizationId,
        userId: ownerId,
      },
    });
    const otherBrand = await this.db.brand.create({
      data: {
        label: 'Other',
        slug: 'embedding-other-' + suffix,
        organizationId,
        userId: ownerId,
      },
    });
    const member = await this.db.member.create({
      data: {
        organizationId,
        userId: ownerId,
        roleId: role.id,
        roleKey: 'OWNER',
        isActive: true,
        currentBrandId: brand.id,
        brands: { connect: [{ id: brand.id }] },
      },
    });
    const base = await this.db.contextBase.create({
      data: {
        organizationId,
        sourceBrandId: brand.id,
        createdById: ownerId,
        data: {
          label: 'Embedding fixture',
          type: 'content_library',
          isActive: true,
          entryCount: 0,
        },
      },
    });
    return {
      organizationId,
      brandId: brand.id,
      otherBrandId: otherBrand.id,
      ownerId,
      otherUserId,
      memberId: member.id,
      actor: { organizationId, userId: ownerId, isApiKey: false, scopes: [] },
      baseId: base.id,
    };
  }
  async intent(world: EmbeddingWorld, entryId: string) {
    return this.db.contextEmbeddingJob.findFirstOrThrow({
      where: {
        organizationId: world.organizationId,
        contextEntryId: entryId,
        isDeleted: false,
      },
      orderBy: { generation: 'desc' },
    });
  }
  async status(
    world: EmbeddingWorld,
    entryId: string,
    status: string,
    timeoutMs = 30000,
  ): Promise<void> {
    await waitFor(
      async () => (await this.intent(world, entryId)).status === status,
      timeoutMs,
    );
  }
  async redisContainer(): Promise<string> {
    const id = process.env.CONTEXT_EMBEDDING_REDIS_CONTAINER_ID;
    if (
      process.env.GITHUB_ACTIONS !== 'true' ||
      !id ||
      !/^[a-f0-9]{64}$/.test(id)
    )
      throw new Error(
        'Redis restart proof requires this CI job service container identity',
      );
    const { stdout } = await command('docker', ['inspect', id], {
      maxBuffer: 1024 * 1024,
    });
    const inspected: unknown = JSON.parse(stdout);
    const container = Array.isArray(inspected) ? record(inspected[0]) : {};
    const config = record(container.Config);
    const host = record(container.HostConfig);
    const bindings = record(host.PortBindings);
    const mapped = bindings['6379/tcp'];
    const port = Array.isArray(mapped) ? record(mapped[0]).HostPort : undefined;
    if (
      container.Id !== id ||
      config.Image !== 'redis:7' ||
      String(port) !== (this.redisUrl.port || '6379')
    )
      throw new Error(
        'Refusing to restart a Redis container outside the disposable acceptance service',
      );
    return id;
  }
  async stopRedis(): Promise<void> {
    const id = await this.redisContainer();
    this.redisOutageExpected = true;
    await command('docker', ['stop', '--time', '1', id], { timeout: 30000 });
    await waitFor(async () => {
      try {
        await this.redis.ping();
        return false;
      } catch {
        return true;
      }
    });
  }
  async startRedis(): Promise<void> {
    const id = await this.redisContainer();
    await command('docker', ['start', id], { timeout: 30000 });
    await waitFor(async () => {
      try {
        return (await this.redis.ping()) === 'PONG';
      } catch {
        return false;
      }
    });
    await this.queue.waitUntilReady();
    await this.app.get(ContextEmbeddingProcessor).worker.waitUntilReady();
    this.redisOutageExpected = false;
  }
  close(): Promise<ContextEmbeddingCleanupReceipt> {
    this.closing ??= this.closeOpenedResources();
    return this.closing;
  }

  private async closeOpenedResources(): Promise<ContextEmbeddingCleanupReceipt> {
    this.transport.releaseAll();
    const receipt: ContextEmbeddingCleanupReceipt = {
      startupCompleted: this.startupCompleted,
      redisPrefix: this.prefix,
      redisNamespaceAttempted: this.namespaceAttempted,
      redisKeysRemaining: null,
      queuesClosed: this.actualQueues.size ? 0 : null,
      applicationClosed: this.app ? false : null,
      databaseClientDisconnected: this.databaseConnectionAttempted
        ? false
        : null,
      loopbackServerClosed: this.transportOpenAttempted ? false : null,
    };
    await closeContextEmbeddingResources([
      async () => {
        if (this.app) {
          await this.app.close();
          receipt.applicationClosed = true;
        }
      },
      async () => {
        await closeContextEmbeddingResources(
          [...this.actualQueues].map((queue) => async () => {
            await queue.close();
          }),
        );
        if (this.actualQueues.size)
          receipt.queuesClosed = this.actualQueues.size;
      },
      async () => {
        if (this.databaseConnectionAttempted) {
          await this.db.$disconnect();
          receipt.databaseClientDisconnected = true;
        }
      },
      async () => {
        if (this.transportOpenAttempted) {
          await this.transport.close();
          receipt.loopbackServerClosed = true;
        }
      },
      async () => {
        if (!this.namespaceAttempted) {
          this.redis.disconnect();
          return;
        }
        try {
          if (this.applicationConstructionAttempted && !this.app)
            throw new Error(
              'Incomplete application construction prevents namespace cleanup proof',
            );
          if (
            this.actualQueues.size &&
            receipt.queuesClosed !== this.actualQueues.size
          )
            throw new Error(
              'Actual queues must close before namespace cleanup',
            );
          if (this.app && !receipt.applicationClosed)
            throw new Error(
              'Disposable Redis cleanup requires a stopped application',
            );
          if (this.redis.status !== 'ready')
            throw new Error('Disposable Redis cleanup could not be verified');
          let cursor = '0';
          do {
            const result = await this.redis.scan(
              cursor,
              'MATCH',
              this.prefix + ':*',
              'COUNT',
              200,
            );
            cursor = result[0];
            if (result[1].some((key) => !key.startsWith(this.prefix + ':')))
              throw new Error('Refusing foreign Redis cleanup');
            if (result[1].length) await this.redis.unlink(...result[1]);
          } while (cursor !== '0');
          const remaining = await this.redis.keys(this.prefix + ':*');
          if (remaining.length)
            throw new Error('Disposable Redis namespace cleanup left keys');
          receipt.redisKeysRemaining = remaining.length;
          await this.redis.quit();
        } finally {
          this.redis.disconnect();
        }
      },
    ]);
    if (
      this.startupCompleted &&
      (receipt.applicationClosed !== true ||
        receipt.databaseClientDisconnected !== true ||
        receipt.loopbackServerClosed !== true ||
        receipt.redisKeysRemaining !== 0 ||
        !this.actualQueues.size ||
        receipt.queuesClosed !== this.actualQueues.size)
    )
      throw new Error('Complete acceptance cleanup was not proven');
    return receipt;
  }
}
