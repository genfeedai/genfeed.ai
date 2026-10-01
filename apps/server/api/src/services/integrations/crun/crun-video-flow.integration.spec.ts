import { createHash, randomUUID } from 'node:crypto';
import {
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { GenerationBillingService } from '@api/collections/credits/services/generation-billing.service';
import { GenerationQuoteGroupService } from '@api/collections/credits/services/generation-quote-group.service';
import { CrunVideoQuoteController } from '@api/collections/videos/controllers/crun-video-quote.controller';
import { CrunVideoGenerationService } from '@api/collections/videos/services/crun-video-generation.service';
import { CrunVideoInputService } from '@api/collections/videos/services/crun-video-input.service';
import { CrunVideoPreviewQuoteService } from '@api/collections/videos/services/crun-video-preview-quote.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import { persistQuoteGroupDisposition } from '@api/helpers/utils/credits/persist-quote-group-completion.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { CacheService } from '@api/services/cache/cache.service';
import { buildCrunContract } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import {
  CRUN_VIDEO_MANIFEST,
  CRUN_VIDEO_PRICING_SNAPSHOT,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import { createCrunTestTransport } from '@api/services/integrations/crun/contracts/fixtures/crun-test-transport';
import { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import { CrunQuoteService } from '@api/services/integrations/crun/crun-quote.service';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import { CrunTaskFinalizationService } from '@api/services/integrations/crun/crun-task-finalization.service';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { CrunPromptBuilder } from '@api/services/prompt-builder/builders/crun-prompt.builder';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditTransactionCategory,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
  ModelCategory,
} from '@genfeedai/contracts';
import { quoteModelBillableCompletion } from '@genfeedai/pricing';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { z } from 'zod';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
vi.mock('@genfeedai/config', async (original) => ({
  ...(await original<object>()),
  usesMeteredCredits: () => true,
}));

/** Other touched services use the real client. Unrelated fixture tables follow the canonical Prisma scalar schema, without foreign keys. */
async function createFixtureTables(pool: Pool) {
  const names = new Set([
    'Activity',
    'Brand',
    'Model',
    'ModelProviderContract',
    'Prompt',
    'Ingredient',
    'Metadata',
    'CreditBalance',
    'CreditReservation',
    'CreditTransaction',
    'MediaVendorCost',
    'WorkflowNodeContinuation',
    'WorkflowExecution',
  ]);
  const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const literal = (value: unknown) =>
    `'${String(value).replaceAll("'", "''")}'`;
  const schema = readFileSync(
    new URL(
      '../../../../../../../packages/prisma/prisma/schema.prisma',
      import.meta.url,
    ),
    'utf8',
  );
  const enumerations = new Set<string>();
  for (const match of schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)) {
    enumerations.add(match[1]);
    const values = [
      ...match[2].matchAll(/^\s*(\w+)\s*(?:@map\("([^"]+)"\))?\s*$/gm),
    ].map((value) => literal(value[2] ?? value[1]));
    await pool.query(
      `CREATE TYPE ${quoted(match[1])} AS ENUM (${values.join(',')})`,
    );
  }
  const scalarTypes: Record<string, string> = {
    String: 'text',
    Boolean: 'boolean',
    Int: 'integer',
    BigInt: 'bigint',
    Float: 'double precision',
    Decimal: 'numeric',
    Json: 'jsonb',
    DateTime: 'timestamp(3)',
    Bytes: 'bytea',
  };
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (!names.has(match[1])) continue;
    const columns: string[] = [];
    for (const field of match[2].matchAll(
      /^\s*(\w+)\s+(\w+)(\[\]|\?)?([^\n]*)$/gm,
    )) {
      const [, name, kind, suffix, attributes] = field;
      const scalar = enumerations.has(kind) ? quoted(kind) : scalarTypes[kind];
      if (!scalar) continue; // relation fields are not persisted columns
      const type = `${scalar}${suffix === '[]' ? '[]' : ''}`;
      const defaultValue = attributes.match(
        /@default\(("(?:\\.|[^"\\])*"|true|false|-?[\d.]+|\w+)\)/,
      )?.[1];
      let defaultSql = suffix === '[]' ? ` DEFAULT ARRAY[]::${type}` : '';
      if (attributes.includes('@default(now())')) defaultSql = ' DEFAULT now()';
      else if (defaultValue) {
        const value: unknown = defaultValue.startsWith('"')
          ? JSON.parse(defaultValue)
          : defaultValue;
        defaultSql = ` DEFAULT ${['Boolean', 'Int', 'BigInt', 'Float', 'Decimal'].includes(kind) ? String(value) : literal(value)}${kind === 'Json' ? '::jsonb' : ''}`;
      }
      const column = attributes.match(/@map\("([^"]+)"\)/)?.[1] ?? name;
      columns.push(
        `${quoted(column)} ${type}${suffix !== '?' ? ' NOT NULL' : ''}${defaultSql}${attributes.includes('@id') ? ' PRIMARY KEY' : attributes.includes('@unique') ? ' UNIQUE' : ''}`,
      );
    }
    const table = match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1];
    await pool.query(`CREATE TABLE ${quoted(table)} (${columns.join(',')})`);
    for (const unique of match[2].matchAll(/@@unique\(\[([^\]]+)\]/g))
      await pool.query(
        `CREATE UNIQUE INDEX ON ${quoted(table)} (${unique[1]
          .split(',')
          .map((name) => quoted(name.trim()))
          .join(',')})`,
      );
  }
}

describe('Crun video quote through durable owned output and accounting', () => {
  const schema = `crun_flow_${randomUUID().replaceAll('-', '')}`;
  let pool: Pool;
  let prisma: PrismaClient;
  let redis: Redis;
  let ownedDirectory: string;
  let transport: Awaited<ReturnType<typeof createCrunTestTransport>>;
  const cleanupKeys: string[] = [];
  let manifestPath: string | undefined;
  const persistManifest = () => {
    if (!manifestPath) return;
    const temporary = `${manifestPath}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify({
        version: 1,
        schema,
        ownedDirectory,
        redisKeys: [...new Set(cleanupKeys)],
      }),
      { mode: 0o600 },
    );
    renameSync(temporary, manifestPath);
  };
  const registerRedisKeys = (...keys: string[]) => {
    cleanupKeys.push(...keys);
    persistManifest();
  };
  let currentOrganizationId: string | undefined;
  afterEach(async () => {
    try {
      if (currentOrganizationId)
        await prisma.crunGenerationTask.updateMany({
          where: { organizationId: currentOrganizationId, isDeleted: false },
          data: { nextPollAt: null },
        });
    } finally {
      currentOrganizationId = undefined;
      transport?.restoreMedia();
      transport?.setEstimated(false);
      transport?.setOnCreate(undefined);
    }
  });
  beforeAll(async () => {
    const database = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;
    const redisUrl = process.env.CRUN_TEST_REDIS_URL;
    if (!database || !redisUrl)
      throw new Error(
        'Dedicated loopback PostgreSQL and Redis fixtures are mandatory',
      );
    for (const value of [database, redisUrl])
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)
      )
        throw new Error('Fixture forbids non-loopback services');
    const explicitManifest = process.env.CRUN_TEST_RUN_MANIFEST;
    const explicitDirectory = process.env.CRUN_TEST_OWNED_DIRECTORY;
    if (Boolean(explicitManifest) !== Boolean(explicitDirectory))
      throw new Error('Manifest and owned directory must be supplied together');
    if (explicitManifest && explicitDirectory) {
      const tempParent = realpathSync('/tmp');
      if (
        dirname(explicitManifest) !== '/tmp' ||
        !/^crun-run-[a-f0-9-]+\.json$/.test(basename(explicitManifest)) ||
        realpathSync(explicitManifest) !==
          join(tempParent, basename(explicitManifest)) ||
        dirname(explicitDirectory) !== '/tmp' ||
        !/^crun-owned-[a-f0-9-]+$/.test(basename(explicitDirectory)) ||
        realpathSync(explicitDirectory) !==
          join(tempParent, basename(explicitDirectory)) ||
        !statSync(explicitDirectory).isDirectory()
      )
        throw new Error('Invalid owned fixture paths');
      const initial = z
        .object({
          version: z.literal(1),
          schema: z.null(),
          ownedDirectory: z.literal(explicitDirectory),
          redisKeys: z.array(z.string()).length(0),
        })
        .strict()
        .parse(JSON.parse(readFileSync(explicitManifest, 'utf8')));
      ownedDirectory = initial.ownedDirectory;
      manifestPath = explicitManifest;
      persistManifest(); // registration precedes CREATE and every owned byte write
    }
    pool = new Pool({ connectionString: database });
    await pool.query(
      `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`,
    );
    await createFixtureTables(pool);
    const migration = readFileSync(
      new URL(
        '../../../../../../../packages/prisma/prisma/migrations/20261001120000_add_crun_generation_tasks/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await pool.query(migration);
    const url = new URL(database);
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    });
    redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    await redis.connect();
    if (!ownedDirectory)
      ownedDirectory = await mkdtemp(join(tmpdir(), 'crun-owned-'));
    transport = await createCrunTestTransport(
      readFileSync(
        new URL(
          '../../../../../../../playwright/e2e/fixtures/media/studio-clip.mp4',
          import.meta.url,
        ),
      ),
    );
    vi.stubGlobal('fetch', transport.fetch);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    const cleanup = [
      [
        'listener',
        async () => {
          await transport?.close();
        },
      ],
      [
        'owned-directory',
        async () => {
          if (ownedDirectory)
            await rm(ownedDirectory, { recursive: true, force: true });
        },
      ],
      [
        'redis-keys-and-client',
        async () => {
          if (redis?.status === 'ready') {
            try {
              if (cleanupKeys.length) await redis.del(...new Set(cleanupKeys));
            } finally {
              await redis.quit();
            }
          } else redis?.disconnect();
        },
      ],
      [
        'prisma-client',
        async () => {
          await prisma?.$disconnect();
        },
      ],
      [
        'schema-and-pool',
        async () => {
          if (pool) {
            try {
              await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            } finally {
              await pool.end();
            }
          }
        },
      ],
    ] as const;
    const results = await Promise.allSettled(
      cleanup.map(([, operation]) => operation()),
    );
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected' ? [cleanup[index][0]] : [],
    );
    expect(
      failed,
      'Owned fixture cleanup failed; manifest remains for exact external cleanup',
    ).toEqual([]);
  });

  it.each([
    [0, 1, 'hosted', 'success', 'default'],
    [0, 1, 'byok', 'success', 'default'],
    [0, 1, 'free', 'success', 'default'],
    [0, 4, 'hosted', 'success', 'default'],
    [0, 4, 'byok', 'success', 'default'],
    [0, 4, 'free', 'success', 'default'],
    [1, 1, 'hosted', 'success', 'default'],
    [1, 1, 'byok', 'success', 'default'],
    [1, 1, 'free', 'success', 'default'],
    [1, 4, 'hosted', 'success', 'default'],
    [1, 4, 'byok', 'success', 'default'],
    [1, 4, 'free', 'success', 'default'],
    [0, 4, 'hosted', 'mixed', 'default'],
    [1, 4, 'hosted', 'failed', 'default'],
    [0, 4, 'hosted', 'refused', 'default'],
    [0, 4, 'hosted', 'deferred', 'default'],
    [0, 4, 'hosted', 'disabled', 'default'],
    [0, 4, 'hosted', 'ambiguous', 'default'],
    [0, 1, 'hosted', 'success', '10s'],
    [0, 1, 'hosted', 'success', 'start'],
    [0, 1, 'hosted', 'success', 'end'],
    [1, 1, 'hosted', 'success', '1080p'],
    [1, 1, 'hosted', 'success', '4k'],
  ] as const)(
    'model %s outputs %s funding %s scenario %s variant %s: frozen quote, restart, owned storage and exact accounting',
    async (modelIndex, outputs, funding, scenario, variant) => {
      transport.setCredits(funding === 'free' ? 0 : undefined);
      transport.setOutcomes(
        scenario === 'mixed'
          ? ['success', 'failed', 'success', 'failed']
          : scenario === 'failed'
            ? ['failed', 'failed', 'failed', 'failed']
            : scenario === 'refused'
              ? ['success', 'refused', 'success', 'refused']
              : scenario === 'ambiguous'
                ? ['success', 'refused', 'ambiguous', 'success']
                : [],
      );
      const org = randomUUID();
      currentOrganizationId = org;
      const user = {
        userId: randomUUID(),
        id: randomUUID(),
        organizationId: org,
        brandId: randomUUID(),
      };
      const account = `account-${org}`;
      const key = `fixture-${randomUUID()}`;
      const fixtureFingerprint = createHash('sha256').update(key).digest('hex');
      registerRedisKeys(`crun:requests:${fixtureFingerprint}`);
      let enabled = true;
      transport.setOnCreate(
        scenario === 'disabled'
          ? () => {
              enabled = false;
            }
          : undefined,
      );
      const logger = {
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
      };
      const config = {
        ingredientsEndpoint: 'https://owned-fixture.invalid',
        get: (name: string) =>
          ({
            CRUN_ENABLED: String(enabled),
            CRUN_API_KEY: key,
            CRUN_CREDITS_PER_USD: '1000',
            CRUN_RATE_VERSION: 'fixture-rate',
          })[name],
      };
      const client = prisma as unknown as PrismaService;
      const balance = new CreditBalanceService(client, logger as never);
      const transactions = new CreditTransactionsService(
        client,
        logger as never,
        balance,
        { invalidate: vi.fn(), invalidateByTags: vi.fn() } as never,
      );
      const reservation = new CreditReservationService(
        client,
        logger as never,
        balance,
        transactions,
        new TransactionUtil(client, logger as never),
      );
      const credits = {
        checkOrganizationCreditsAvailable: async (
          _org: string,
          amount: number,
        ) =>
          (await balance.getOrCreateBalance(org, undefined, account)).balance -
            (await balance.getOrCreateBalance(org, undefined, account))
              .heldAmount >=
          amount,
        getOrganizationCreditsBalance: async () =>
          (await balance.getOrCreateBalance(org, undefined, account)).balance,
        reserveCredits: (
          input: Parameters<CreditReservationService['reserve']>[0],
        ) => reservation.reserve({ ...input, billingAccountId: account }),
        releaseReservation: (
          input: Parameters<CreditReservationService['release']>[0],
        ) => reservation.release(input),
        settleReservation: (
          input: Parameters<CreditReservationService['settle']>[0],
        ) => reservation.settle(input),
        findReservationForWorkload: async () => null,
      };
      const groups = new GenerationQuoteGroupService(
        credits as never,
        client,
        logger as never,
      );
      const billing = new GenerationBillingService(
        credits as never,
        {
          queueDeduction: vi.fn(),
          queueByokUsage: async (job: {
            amount: number;
            source: string;
            description: string;
            userId: string;
            idempotencyKey: string;
            metadata: Record<string, unknown>;
          }) => {
            await transactions.createTransactionEntry(
              org,
              CreditTransactionCategory.BYOK_USAGE,
              job.amount,
              100,
              100,
              job.source,
              job.description,
              undefined,
              undefined,
              {
                actorUserId: job.userId,
                billingAccountId: account,
                idempotencyKey: `byok:${org}:${job.idempotencyKey}`,
                metadata: job.metadata,
              },
            );
          },
        } as never,
        client,
        logger as never,
        groups,
      );
      const cache = new CacheService(
        { instance: redis, isReady: true } as never,
        { setTags: async () => undefined } as never,
        logger as never,
      );
      const originalSet = cache.set.bind(cache);
      vi.spyOn(cache, 'set').mockImplementation(async (key, value, options) => {
        registerRedisKeys(key);
        return originalSet(key, value, options);
      });
      const provider = new CrunClient(cache);
      const byok = {
        lookupApiKey: async () =>
          funding === 'byok' ? { apiKey: key } : undefined,
        lookupRetainedCrunApiKey: async () =>
          funding === 'byok' ? { apiKey: key } : undefined,
      };
      const tasks = new CrunTaskService(
        client,
        byok as never,
        config as never,
        provider,
      );
      const pricingEvidence = {
        ...CRUN_VIDEO_PRICING_SNAPSHOT,
        rates: CRUN_VIDEO_PRICING_SNAPSHOT.rates.map((rate) => ({
          ...rate,
          providerCredits: funding === 'free' ? '0' : rate.providerCredits,
        })),
      };
      const contract = buildCrunContract(CRUN_VIDEO_MANIFEST[modelIndex]);
      const modelKey = `crun/${contract.endpoint}`;
      await prisma.brand.create({
        data: {
          id: user.brandId,
          organizationId: org,
          slug: `crun-fixture-${org}`,
          label: 'Fixture brand',
        },
      });
      const existing = await prisma.model.findFirst({
        where: { key: modelKey },
      });
      const modelData = {
        key: modelKey,
        endpoint: contract.endpoint,
        label: 'Reviewed fixture',
        provider: 'crun',
        category: ModelCategory.VIDEO,
        isActive: true,
        reviewedProviderContractVersion: contract.version,
        pendingProviderContractVersion: null,
        providerInputSchema: contract as unknown as Prisma.InputJsonObject,
      };
      const model = existing
        ? await prisma.model.update({
            where: { id: existing.id },
            data: modelData,
          })
        : await prisma.model.create({ data: modelData });
      await prisma.modelProviderContract.upsert({
        where: {
          provider_endpoint_version: {
            provider: 'crun',
            endpoint: contract.endpoint,
            version: contract.version,
          },
        },
        update: {
          reviewStatus: 'approved',
          modelId: model.id,
          pricing: pricingEvidence as unknown as Prisma.InputJsonObject,
        },
        create: {
          provider: 'crun',
          endpoint: contract.endpoint,
          modelId: model.id,
          version: contract.version,
          reviewStatus: 'approved',
          mappingStatus: 'supported',
          openapi: {},
          inputSchema: {},
          outputSchema: {},
          pricing: pricingEvidence as unknown as Prisma.InputJsonObject,
        },
      });
      const models = {
        findOne: async () =>
          prisma.model.findFirst({
            where: { key: modelKey, isDeleted: false },
          }),
        findBillablePricingProfile: async () =>
          billableProfile({
            key: modelKey,
            provider: 'crun',
            rateVersion: contract.version,
            cost: funding === 'free' ? 0 : 3,
            isFree: funding === 'free',
          }),
      };
      const promptBuilder = new CrunPromptBuilder();
      const input = new CrunVideoInputService(
        client,
        models as never,
        {
          findOne: (where: Prisma.IngredientWhereInput) =>
            prisma.ingredient.findFirst({ where }),
        } as never,
        { findOne: async () => null } as never,
        {
          buildPrompt: async (
            selected: string,
            params: Parameters<CrunPromptBuilder['buildPrompt']>[1],
          ) => ({
            input: promptBuilder.buildPrompt(selected, params, params.prompt),
            templateUsed: undefined,
            templateVersion: undefined,
          }),
        } as never,
        tasks,
        config as never,
      );
      const preview = new CrunVideoPreviewQuoteService(
        input,
        new CrunQuoteService(provider),
        cache,
        tasks,
        models as never,
        client,
        config as never,
      );
      const shared = {
        createMediaDocuments: async (
          _user: unknown,
          data: Record<string, unknown>,
        ) => {
          expect(data).toMatchObject({
            category: IngredientCategory.VIDEO,
            extension: MetadataExtension.MP4,
            model: modelKey,
            generationSource: 'studio',
          });
          expect(data.sourceIds).toEqual(
            variant === 'start' || variant === 'end'
              ? [startId, ...(variant === 'end' ? [endId] : [])]
              : [],
          );
          expect(data.parentId).toBe(
            variant === 'start' || variant === 'end' ? startId : undefined,
          );
          const metadata = await prisma.metadata.create({
            data: { extension: MetadataExtension.MP4, label: 'Fixture output' },
          });
          const ingredient = await prisma.ingredient.create({
            data: {
              userId: user.userId,
              organizationId: org,
              brandId: user.brandId,
              metadataId: metadata.id,
              promptId: String(data.promptId),
              status: IngredientStatus.PROCESSING,
              category: IngredientCategory.VIDEO,
              modelUsed: modelKey,
              parentId:
                typeof data.parentId === 'string' ? data.parentId : null,
              generationPrompt: String(data.generationPrompt),
              groupId: String(data.groupId),
              groupIndex: Number(data.groupIndex),
            },
          });
          return { ingredientData: ingredient, metadataData: metadata };
        },
      };
      const adapter = new CrunVideoGenerationService(
        preview,
        input,
        tasks,
        billing,
        credits as never,
        shared as never,
        {
          create: (data: Prisma.PromptCreateInput) =>
            prisma.prompt.create({ data }),
        } as never,
        {
          findOne: (where: Prisma.IngredientWhereInput) =>
            prisma.ingredient.findFirst({ where }),
        } as never,
        client,
        cache,
      );
      await prisma.creditBalance.create({
        data: {
          organizationId: org,
          billingAccountId: account,
          balance: 100,
          heldAmount: 0,
        },
      });
      const startId = randomUUID();
      const endId = randomUUID();
      if (variant === 'start' || variant === 'end') {
        for (const id of [startId, ...(variant === 'end' ? [endId] : [])]) {
          await prisma.ingredient.create({
            data: {
              id,
              organizationId: org,
              brandId: user.brandId,
              userId: user.userId,
              category: IngredientCategory.IMAGE,
              status: IngredientStatus.GENERATED,
            },
          });
        }
      }
      const intent = {
        model: modelKey,
        text: 'Fixture bird',
        outputs,
        ...(variant === 'start' || variant === 'end'
          ? { references: [startId], parentId: startId }
          : {}),
        ...(variant === 'end' ? { endFrame: endId } : {}),
        crunControls: {
          contractVersion: contract.version,
          ...(variant === '10s'
            ? { duration: 10 }
            : variant === '1080p' || variant === '4k'
              ? { resolution: variant }
              : {}),
        },
      };
      const request = {
        user,
        originalUrl: '/videos',
        creditsConfig: { amount: 0, deferred: true },
      };
      const estimateCountBefore = transport.requests.filter((item) =>
        item.route.endsWith('/estimate-credits'),
      ).length;
      if (modelIndex === 1) {
        for (const duration of [4, 6]) {
          expect(
            await preview.preview(
              { ...intent, crunControls: { ...intent.crunControls, duration } },
              user as never,
            ),
          ).toMatchObject({
            isAvailable: false,
            reasonCode: 'PRICING_UNAVAILABLE',
          });
        }
      }
      const deletedFrame = randomUUID();
      const videoFrame = randomUUID();
      const foreignFrame = randomUUID();
      for (const data of [
        {
          id: deletedFrame,
          organizationId: org,
          category: IngredientCategory.IMAGE,
          isDeleted: true,
        },
        {
          id: videoFrame,
          organizationId: org,
          category: IngredientCategory.VIDEO,
          isDeleted: false,
        },
        {
          id: foreignFrame,
          organizationId: randomUUID(),
          category: IngredientCategory.IMAGE,
          isDeleted: false,
        },
      ])
        await prisma.ingredient.create({
          data: { ...data, brandId: user.brandId, userId: user.userId },
        });
      for (const invalid of [
        { ...intent, brandId: randomUUID() },
        { ...intent, folderId: randomUUID() },
        { ...intent, references: [randomUUID()] },
        { ...intent, references: [deletedFrame] },
        { ...intent, references: [videoFrame] },
        { ...intent, references: [foreignFrame] },
        {
          ...intent,
          crunControls: { ...intent.crunControls, unreviewed: true },
        },
      ])
        await expect(
          preview.preview(invalid, user as never),
        ).rejects.toBeDefined();
      expect(
        transport.requests.filter((item) =>
          item.route.endsWith('/estimate-credits'),
        ),
      ).toHaveLength(estimateCountBefore);
      transport.setEstimated(true);
      expect(await preview.preview(intent, user as never)).toMatchObject({
        isAvailable: false,
        reasonCode: 'PRICING_UNAVAILABLE',
      });
      transport.setEstimated(false);
      const quoted = await new CrunVideoQuoteController(preview).quote(
        intent as never,
        request as never,
      );
      if (!quoted.data || Array.isArray(quoted.data))
        throw new Error('Quote must return one JSON API resource');
      const attributes = quoted.data.attributes as {
        isAvailable: boolean;
        reasonCode: string | null;
        quoteId: string;
        credits: number;
      };
      if (attributes.quoteId)
        registerRedisKeys(
          `crun:video:quote:${org}:${user.userId}:${attributes.quoteId}`,
          `crun:video:quote:${org}:${user.userId}:${attributes.quoteId}:consumed`,
        );
      expect(attributes.reasonCode).toBeNull();
      expect(attributes).toMatchObject({ isAvailable: true });
      expect(
        await prisma.creditReservation.count({
          where: { organizationId: org },
        }),
      ).toBe(0);
      if (scenario === 'deferred')
        for (let index = 0; index < 17; index++)
          expect(
            (await cache.claimCrunRequestSlot(fixtureFingerprint))?.isAdmitted,
          ).toBe(true);
      const createdBefore = transport.requests.filter((item) =>
        item.route.endsWith('/CreateTask'),
      ).length;
      const generated = await adapter.generate(
        user as never,
        { ...intent, crunQuoteId: attributes.quoteId } as never,
        request as never,
      );
      if (!generated.data || Array.isArray(generated.data))
        throw new Error('Generation must return one JSON API resource');
      const ids = (
        generated.data.attributes as { pendingIngredientIds: string[] }
      ).pendingIngredientIds;
      expect(ids).toHaveLength(outputs);
      const rows = await prisma.crunGenerationTask.findMany({
        where: { organizationId: org },
        orderBy: { outputIndex: 'asc' },
      });
      expect(rows.map((row) => row.ingredientId)).toEqual(ids);
      if (scenario === 'deferred' || scenario === 'disabled') {
        expect(
          rows.filter((row) => row.state === 'provider-failed'),
        ).toHaveLength(3);
        expect(
          transport.requests.filter((item) =>
            item.route.endsWith('/CreateTask'),
          ).length - createdBefore,
        ).toBe(1);
      } else if (scenario === 'ambiguous')
        expect(
          rows.filter((row) => row.state === 'recovery-required'),
        ).toHaveLength(1);
      else
        expect(
          rows.every(
            (row) =>
              (row.providerTaskId && row.state === 'pending') ||
              (scenario === 'refused' && row.state === 'provider-failed'),
          ),
        ).toBe(true);
      // Advance only the owned fixture's gate window so status reads can drain; no CreateTask is retried.
      if (scenario === 'deferred')
        await redis.del(`crun:requests:${fixtureFingerprint}`);
      if (funding === 'hosted') {
        const hold = await prisma.creditReservation.findFirstOrThrow({
          where: { organizationId: org, isDeleted: false },
        });
        expect(hold.metadata).toMatchObject({ dispatchClosed: true });
        await expect(
          reservation.settle({
            description: 'Fixture settlement',
            organizationId: org,
            reservationId: hold.id,
            actorUserId: user.userId,
            actualAmount: attributes.credits,
          }),
        ).rejects.toThrow('Crun settlement proof is incomplete');
        const unchanged = await prisma.creditReservation.findFirstOrThrow({
          where: { id: hold.id, organizationId: org },
        });
        expect(unchanged.status).toBe('RESERVED');
      }
      const held = await prisma.creditBalance.findFirstOrThrow({
        where: { organizationId: org },
      });
      expect(held.balance).toBe(100);
      expect(held.heldAmount).toBe(
        funding === 'hosted' ? attributes.credits : 0,
      );
      enabled = false;
      // A restarted service has no in-memory task or temporary media URL state.
      const restarted = new CrunTaskService(
        client,
        byok as never,
        config as never,
        provider,
      );
      const mediaErrors: string[] = [];
      const media = {
        processMediaForIngredient: async (
          ingredientId: string,
          _kind: string,
          url: string,
        ) => {
          try {
            const response = await transport.fetch(url);
            if (!response.ok)
              throw new Error('Fixture temporary media unavailable');
            const bytes = Buffer.from(await response.arrayBuffer());
            await writeFile(join(ownedDirectory, ingredientId), bytes);
            const owner = await prisma.ingredient.findFirstOrThrow({
              where: {
                id: ingredientId,
                organizationId: org,
                isDeleted: false,
              },
              select: { metadataId: true },
            });
            await prisma.metadata.updateMany({
              where: { id: owner.metadataId ?? '', isDeleted: false },
              data: {
                duration: 1,
                width: 64,
                height: 64,
                hasAudio: false,
                size: bytes.length,
              },
            });
            const projection = {
              s3Key: `owned/${ingredientId}.mp4`,
              status: IngredientStatus.GENERATED,
            };
            const scoped = {
              id: ingredientId,
              organizationId: org,
              isDeleted: false,
            };
            const grouped = await persistQuoteGroupDisposition(
              client,
              scoped,
              projection,
            );
            if (grouped === null)
              await prisma.ingredient.updateMany({
                where: scoped,
                data: projection,
              });
          } catch (error: unknown) {
            mediaErrors.push(
              error instanceof Error ? error.message : String(error),
            );
            throw error;
          }
        },
      };
      const finalizer = new CrunTaskFinalizationService(
        client,
        media as never,
        billing,
        new MediaVendorCostLedgerService(client, logger as never),
        logger as never,
      );
      await prisma.crunGenerationTask.updateMany({
        where: { organizationId: org },
        data: { nextPollAt: new Date(Date.now() - 1) },
      });
      for (const claimed of await restarted.claimDue()) {
        if (claimed.state === 'provider-failed') {
          await finalizer.finalize(claimed);
          continue;
        }
        const terminal = await restarted.poll(claimed);
        if (terminal) await finalizer.finalize(terminal.task, terminal.info);
      }
      await prisma.crunGenerationTask.updateMany({
        where: { organizationId: org, state: { not: 'finalized' } },
        data: {
          nextPollAt: new Date(Date.now() - 1),
          nextAccountingAttemptAt: new Date(Date.now() - 1),
        },
      });
      for (const claimed of await restarted.claimDue())
        await finalizer.finalize(claimed);
      const phaseEvidence = await prisma.crunGenerationTask.findMany({
        where: { organizationId: org, isDeleted: false },
        select: {
          state: true,
          recoveryCode: true,
          copyAttemptCount: true,
          mediaPersistedAt: true,
          vendorCostRecordedAt: true,
          billingRecordedAt: true,
          nextMediaAttemptAt: true,
          nextAccountingAttemptAt: true,
          leaseUntil: true,
        },
      });
      const ingredientEvidence = await prisma.ingredient.findMany({
        where: { organizationId: org, isDeleted: false },
        select: { status: true, s3Key: true, generationBilling: true },
      });
      const holdEvidence = await prisma.creditReservation.findMany({
        where: { organizationId: org, isDeleted: false },
        select: { status: true, amount: true, settledAmount: true },
      });
      expect(
        await prisma.crunGenerationTask.count({
          where: { organizationId: org, state: 'finalized' },
        }),
        JSON.stringify({
          phaseEvidence,
          ingredientEvidence,
          holdEvidence,
          mediaErrors,
        }),
      ).toBe(scenario === 'ambiguous' ? 0 : outputs);
      const wallet = await prisma.creditBalance.findFirstOrThrow({
        where: { organizationId: org },
      });
      const succeeded = await prisma.ingredient.findMany({
        where: { organizationId: org, s3Key: { not: null } },
        select: { id: true },
      });
      const frozen = modelBillableQuoteSnapshotSchema.parse(
        rows[0].quoteSnapshot,
      );
      const completion = quoteModelBillableCompletion(frozen, {
        completedOutputs: succeeded.length,
        successfulRequests: succeeded.length,
      });
      if (completion.status !== 'priced')
        throw new Error('Fixture completion must be priced');
      expect(wallet.balance).toBe(
        funding === 'hosted' && scenario !== 'ambiguous'
          ? 100 - completion.credits
          : 100,
      );
      expect(wallet.heldAmount).toBe(
        scenario === 'ambiguous' ? attributes.credits : 0,
      );
      expect(
        await prisma.creditTransaction.count({
          where: {
            organizationId: org,
            category: CreditTransactionCategory.DEDUCT,
          },
        }),
      ).toBe(
        funding === 'hosted' &&
          scenario !== 'ambiguous' &&
          completion.credits > 0
          ? 1
          : 0,
      );
      expect(
        await prisma.creditTransaction.count({
          where: {
            organizationId: org,
            category: CreditTransactionCategory.BYOK_USAGE,
          },
        }),
      ).toBe(funding === 'byok' ? outputs : 0);
      const expenses = await prisma.mediaVendorCost.findMany({
        where: { organizationId: org },
      });
      expect(expenses).toHaveLength(
        scenario === 'refused' || scenario === 'ambiguous'
          ? 2
          : scenario === 'deferred' || scenario === 'disabled'
            ? 1
            : outputs,
      );
      expect(
        expenses.every(
          (expense) =>
            expense.costEvidence ===
              (funding === 'byok' ? 'byok' : 'observed') &&
            expense.category === 'video' &&
            expense.vendorCostMicros ===
              (funding === 'byok' || funding === 'free'
                ? 0
                : variant === '10s'
                  ? 84000
                  : variant === '1080p'
                    ? 37500
                    : variant === '4k'
                      ? 90000
                      : modelIndex === 0
                        ? 42000
                        : 30000),
        ),
      ).toBe(true);
      for (const { id } of succeeded) {
        const saved = await prisma.ingredient.findFirstOrThrow({
          where: { id, organizationId: org, isDeleted: false },
          include: { metadata: true },
        });
        expect(saved.category).toBe(IngredientCategory.VIDEO);
        expect(saved.metadata).toMatchObject({
          duration: 1,
          width: 64,
          height: 64,
          hasAudio: false,
        });
      }
      const estimatedBodies = transport.requests
        .filter((item) => item.route.endsWith('/estimate-credits'))
        .map((item) => item.input);
      const dispatchedBodies = transport.requests
        .filter((item) => item.route.endsWith('/CreateTask'))
        .slice(createdBefore)
        .map((item) => item.input);
      for (const body of dispatchedBodies)
        expect(estimatedBodies).toContainEqual(body);
      if (variant === 'start' || variant === 'end') {
        expect(dispatchedBodies[0]).toMatchObject({
          input: {
            img_urls: [
              `${config.ingredientsEndpoint}/images/${startId}`,
              ...(variant === 'end'
                ? [`${config.ingredientsEndpoint}/images/${endId}`]
                : []),
            ],
          },
        });
        expect(
          (dispatchedBodies[0] as { input: Record<string, unknown> }).input,
        ).not.toHaveProperty('aspect_ratio');
      }

      await expect(
        adapter.generate(
          user as never,
          {
            ...intent,
            text: 'Different intent',
            crunQuoteId: attributes.quoteId,
          } as never,
          request as never,
        ),
      ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
      await redis.del(
        `crun:video:quote:${org}:${user.userId}:${attributes.quoteId}`,
        `crun:video:quote:${org}:${user.userId}:${attributes.quoteId}:consumed`,
      );
      const createCount = transport.requests.filter((item) =>
        item.route.endsWith('/CreateTask'),
      ).length;
      await adapter.generate(
        user as never,
        { ...intent, crunQuoteId: attributes.quoteId } as never,
        request as never,
      );
      expect(
        transport.requests.filter((item) => item.route.endsWith('/CreateTask')),
      ).toHaveLength(createCount);
      transport.expireMedia();
      expect(
        (await transport.fetch(`${transport.mediaOrigin}/media/expired.png`))
          .status,
      ).toBe(404);
      for (const { id } of succeeded)
        expect(await readFile(join(ownedDirectory, id))).toEqual(
          readFileSync(
            new URL(
              '../../../../../../../playwright/e2e/fixtures/media/studio-clip.mp4',
              import.meta.url,
            ),
          ),
        );
      transport.restoreMedia();
      transport.setOnCreate(undefined);
      expect(JSON.stringify(rows)).not.toContain(transport.base);
    },
  );
});
