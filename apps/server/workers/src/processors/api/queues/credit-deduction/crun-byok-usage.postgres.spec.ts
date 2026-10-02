import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { CreditDeductionJobData } from '@genfeedai/contracts/queue';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { Prisma } from '@genfeedai/prisma';
import { PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { CreditDeductionProcessor } from '@workers/processors/api/queues/credit-deduction/credit-deduction.processor';
import type { Job } from 'bullmq';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

async function createFixtureTables(pool: Pick<Pool, 'query'>) {
  const names = new Set([
    'Activity',
    'Brand',
    'Ingredient',
    'Metadata',
    'CreditBalance',
    'CreditReservation',
    'CreditTransaction',
    'BillingAccount',
    'BillingAccountOrganization',
    'Organization',
    'WorkflowExecution',
  ]);
  const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const literal = (value: unknown) =>
    `'${String(value).replaceAll("'", "''")}'`;
  const schema = readFileSync(
    new URL(
      '../../../../../../../../packages/prisma/prisma/schema.prisma',
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

describe('Crun BYOK usage real Serializable ledger boundaries', () => {
  const schema = `crun_usage_${randomUUID().replaceAll('-', '')}`;
  const application = `crun_usage_${randomUUID()}`;
  const mutationApplication = `${application}_mutation`;
  let pool: Pool;
  let prisma: PrismaClient;
  let balance: CreditBalanceService;
  let transactions: CreditTransactionsService;
  const logger = {
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  beforeAll(async () => {
    const connection = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;
    if (
      !connection ||
      !['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(connection).hostname,
      )
    )
      throw new Error('Dedicated loopback PostgreSQL fixture is mandatory');
    pool = new Pool({ connectionString: connection, max: 5 });
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schema}"`);
      await setup.query(`SET search_path TO "${schema}"`);
      const migration = readFileSync(
        new URL(
          '../../../../../../../../packages/prisma/prisma/migrations/20261001120000_add_crun_generation_tasks/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      await setup.query(migration);
      // The schema builder uses a single dedicated connection, never the shared database's tables.
      await createFixtureTables({ query: setup.query.bind(setup) });
    } finally {
      setup.release();
    }
    const url = new URL(connection);
    url.searchParams.set('options', `-c search_path=${schema}`);
    url.searchParams.set('application_name', application);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url.toString(), max: 5 },
        { schema },
      ),
    });
    const client = prisma as unknown as PrismaService;
    balance = new CreditBalanceService(client, logger as never);
    transactions = new CreditTransactionsService(
      client,
      logger as never,
      balance,
      { invalidate: vi.fn(), invalidateByTags: vi.fn() } as never,
    );
  });
  afterAll(async () => {
    const results = await Promise.allSettled([
      prisma?.$disconnect(),
      pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`),
    ]);
    const closed = await Promise.allSettled([pool?.end()]);
    const failures = [...results, ...closed].flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (failures.length)
      throw new AggregateError(failures, 'Owned PostgreSQL cleanup failed', {
        cause: failures[0],
      });
  });
  async function fixture(
    amount = 3,
    beforeBalance?: () => Promise<void>,
    endpoint = 'google/nano-banana-pro',
    category: IngredientCategory = IngredientCategory.IMAGE,
  ) {
    const org = randomUUID();
    const actor = randomUUID();
    const id = randomUUID();
    const modelKey = `crun/${endpoint}`;
    const usage = {
      kind: 'byok',
      state: 'pending',
      amount,
      description: 'Fixture generation',
      source:
        category === IngredientCategory.VIDEO
          ? ActivitySource.VIDEO_GENERATION
          : ActivitySource.IMAGE_GENERATION,
      userId: actor,
      expiresAt: '2099-01-01T00:00:00.000Z',
      submissionIntentProvider: 'crun',
    };
    const { kind: _kind, state: _state, ...immutable } = usage;
    const priced = quoteModelBillablePricing(
      billableProfile({
        key: modelKey,
        provider: 'crun',
        cost: amount,
        isFree: amount === 0,
      }),
      {
        modelKey,
        provider: 'crun',
        outputs: 1,
        requests: 1,
      },
      1,
      new Date().toISOString(),
    );
    if (priced.status !== 'priced') throw new Error('Invalid fixture quote');
    const quote = {
      ...priced.snapshot,
      providerQuote: {
        provider: 'crun',
        estimated: false,
        providerCreditsPerTask: '8',
        quoteHash: 'a'.repeat(64),
        inputHash: 'b'.repeat(64),
        contractVersion: 'v1',
        creditsPerUsd: null,
        acquisitionRateVersion: null,
        credentialSource: 'byok',
        credentialId: null,
        credentialFingerprint: 'c'.repeat(64),
      },
    };
    await prisma.creditBalance.create({
      data: { organizationId: org, balance: 100, heldAmount: 0 },
    });
    await prisma.ingredient.create({
      data: {
        id,
        organizationId: org,
        userId: actor,
        category,
        status: IngredientStatus.GENERATED,
        s3Key: `owned/${id}.png`,
        generationBilling: toPrismaJson(usage),
      },
    });
    const leaseUntil = new Date(Date.now() + 60000);
    const task = await prisma.crunGenerationTask.create({
      data: {
        organizationId: org,
        ingredientId: id,
        userId: actor,
        endpoint,
        modelKey: quote.modelKey,
        contractVersion: 'v1',
        inputHash: 'b'.repeat(64),
        inputMetadata: {},
        quoteId: randomUUID(),
        outputIndex: 0,
        reservationId: null,
        fundingBinding: toPrismaJson({ kind: 'byok', receipt: immutable }),
        quoteSnapshot: toPrismaJson(quote),
        credentialSource: 'byok',
        credentialId: null,
        credentialFingerprint: 'c'.repeat(64),
        providerTaskId: randomUUID(),
        terminalReceipt: { status: 'success', credits: '8' },
        state: 'provider-success',
        mediaPersistedAt: new Date(),
        vendorCostRecordedAt: new Date(),
        leaseUntil,
        version: 11,
      },
    });
    const processor = new CreditDeductionProcessor(
      {
        getOrganizationCreditsBalance: async (
          organizationId: string,
          tx?: Prisma.TransactionClient,
        ) => {
          await beforeBalance?.();
          const wallet = await balance.getOrCreateBalance(organizationId, tx);
          return wallet.balance - wallet.heldAmount;
        },
      } as never,
      transactions,
      {} as never,
      {} as never,
      logger as never,
      prisma as never,
    );
    const data: CreditDeductionJobData = {
      type: 'record-byok-usage',
      organizationId: org,
      userId: actor,
      amount,
      description: usage.description,
      source: usage.source,
      idempotencyKey: `media-generation-usage:${id}`,
      metadata: { assetId: id, submissionIntentProvider: 'crun' },
    };
    const run = () =>
      processor.process({
        id: randomUUID(),
        data,
        attemptsMade: 0,
        opts: { attempts: 3 },
      } as Job<CreditDeductionJobData>);
    const assertCount = async (count: number) => {
      const ledger = await prisma.creditTransaction.findMany({
        where: { organizationId: org, isDeleted: false },
      });
      expect(ledger).toHaveLength(count);
      expect(
        await prisma.activity.count({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toBe(count);
      const wallet = await prisma.creditBalance.findFirstOrThrow({
        where: { organizationId: org, isDeleted: false },
      });
      expect(wallet.balance).toBe(100);
      expect(wallet.heldAmount).toBe(0);
      const saved = await prisma.crunGenerationTask.findFirstOrThrow({
        where: { id: task.id, organizationId: org, isDeleted: false },
      });
      expect(saved.leaseUntil).toEqual(leaseUntil);
      expect(saved.version).toBe(11);
      expect(saved.billingRecordedAt).toBeNull();
      const ingredient = await prisma.ingredient.findFirstOrThrow({
        where: { id, organizationId: org, isDeleted: false },
      });
      expect(ingredient.generationBilling).toMatchObject({ state: 'pending' });
      if (count)
        expect(ledger[0]).toMatchObject({
          category: CreditTransactionCategory.BYOK_USAGE,
          amount,
          actorUserId: actor,
          source: usage.source,
          metadata: expect.objectContaining({ assetId: id }),
        });
    };
    return { org, id, task, usage, run, assertCount };
  }
  async function waitForBlocked(name: string) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting = await pool.query<{ blocked: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock') AS blocked",
        [name],
      );
      if (waiting.rows[0]?.blocked) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('SQL barrier was not observed');
  }
  it.each([0, 3])(
    'valid usage %s commits one ledger and Activity without debit or lease mutation',
    async (amount) => {
      const f = await fixture(amount);
      await f.run();
      await f.run();
      await f.assertCount(1);
    },
  );
  it('a queued valid job cannot consume a subsequently conflicting receipt', async () => {
    const f = await fixture();
    await prisma.crunGenerationTask.updateMany({
      where: { id: f.task.id, organizationId: f.org, isDeleted: false },
      data: { recoveryCode: 'CRUN_TERMINAL_RECEIPT_CONFLICT' },
    });
    await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_HELD');
    await f.assertCount(0);
  });
  it.each([
    {
      owner: 'task',
      endpoint: 'google/nano-banana-pro',
      category: IngredientCategory.IMAGE,
    },
    {
      owner: 'ingredient',
      endpoint: 'google/nano-banana-pro',
      category: IngredientCategory.IMAGE,
    },
    {
      owner: 'task',
      endpoint: 'kling/v2-5-turbo-pro',
      category: IngredientCategory.VIDEO,
    },
    {
      owner: 'ingredient',
      endpoint: 'google/veo3-1-fast-t2v',
      category: IngredientCategory.VIDEO,
    },
  ])(
    're-reads $owner proof for $endpoint changed while waiting on its SQL row lock',
    async ({ owner, endpoint, category }) => {
      const f = await fixture(3, undefined, endpoint, category);
      const blocker = await pool.connect();
      const consumeErrors: unknown[] = [];
      let consumption: Promise<void> | undefined;
      try {
        await blocker.query('BEGIN');
        const table =
          owner === 'task' ? 'crun_generation_tasks' : 'ingredients';
        const id = owner === 'task' ? f.task.id : f.id;
        await blocker.query(
          `SELECT "id" FROM "${schema}"."${table}" WHERE "id"=$1 AND "organizationId"=$2 FOR UPDATE`,
          [id, f.org],
        );
        consumption = f.run().catch((error: unknown) => {
          consumeErrors.push(error);
        });
        await waitForBlocked(application);
        if (owner === 'task')
          await blocker.query(
            `UPDATE "${schema}"."crun_generation_tasks" SET "recoveryCode"='CRUN_TERMINAL_RECEIPT_CONFLICT' WHERE "id"=$1`,
            [id],
          );
        else
          await blocker.query(
            `UPDATE "${schema}"."ingredients" SET "generationBilling"=$2::jsonb WHERE "id"=$1`,
            [id, JSON.stringify({ ...f.usage, amount: 4 })],
          );
        await blocker.query('COMMIT');
        await consumption;
        expect(consumeErrors).toHaveLength(1);
        await f.assertCount(0);
      } finally {
        try {
          await blocker.query('ROLLBACK');
        } finally {
          blocker.release();
          await Promise.allSettled([consumption]);
        }
      }
    },
  );
  it('consumer locks serialize a later conflicting mutation after the valid ledger commit', async () => {
    let resume: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const atBalance = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const f = await fixture(3, async () => {
      reached();
      await gate;
    });
    const mutation = await pool.connect();
    let consumer: Promise<void> | undefined;
    const consumerErrors: unknown[] = [];
    const mutationErrors: unknown[] = [];
    let primaryFailure = false;
    const cleanupErrors: unknown[] = [];
    let update: Promise<unknown> | undefined;
    let barrierTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      consumer = f.run().catch((error: unknown) => {
        consumerErrors.push(error);
      });
      await Promise.race([
        atBalance,
        consumer.then(() => {
          if (consumerErrors.length) throw consumerErrors[0];
          throw new Error('Consumer finished before proof lock barrier');
        }),
        new Promise<never>((_resolve, reject) => {
          barrierTimer = setTimeout(
            () => reject(new Error('Consumer proof lock barrier not reached')),
            5000,
          );
        }),
      ]);
      clearTimeout(barrierTimer);
      await mutation.query("SELECT set_config('application_name', $1, false)", [
        mutationApplication,
      ]);
      await mutation.query('BEGIN');
      update = mutation
        .query(
          `UPDATE "${schema}"."crun_generation_tasks" SET "recoveryCode"='CRUN_TERMINAL_RECEIPT_CONFLICT' WHERE "id"=$1 AND "organizationId"=$2`,
          [f.task.id, f.org],
        )
        .catch((error: unknown) => {
          mutationErrors.push(error);
        });
      await waitForBlocked(mutationApplication);
      resume();
      await consumer;
      if (consumerErrors.length) throw consumerErrors[0];
      await update;
      if (mutationErrors.length) throw mutationErrors[0];
      await mutation.query('COMMIT');
      await f.assertCount(1);
      await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_HELD');
      await f.assertCount(1);
    } catch (error) {
      primaryFailure = true;
      throw error;
    } finally {
      clearTimeout(barrierTimer);
      resume();
      const settled = await Promise.allSettled([consumer, update]);
      cleanupErrors.push(
        ...settled.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : [],
        ),
      );
      try {
        await mutation.query('ROLLBACK');
      } catch (error) {
        cleanupErrors.push(error);
      }
      try {
        mutation.release();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (!primaryFailure && cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Owned mutation cleanup failed', {
        cause: cleanupErrors[0],
      });
  });
  it.each([
    { endpoint: 'kling/v2-5-turbo-pro', amount: 0 },
    { endpoint: 'kling/v2-5-turbo-pro', amount: 3 },
    { endpoint: 'google/veo3-1-fast-t2v', amount: 0 },
    { endpoint: 'google/veo3-1-fast-t2v', amount: 3 },
  ])(
    'concurrent $endpoint usage $amount records one video ledger and Activity',
    async ({ endpoint, amount }) => {
      const f = await fixture(
        amount,
        undefined,
        endpoint,
        IngredientCategory.VIDEO,
      );
      await Promise.all([f.run(), f.run()]);
      await f.assertCount(1);
    },
  );
  it.each(['kling/v2-5-turbo-pro', 'google/veo3-1-fast-t2v'])(
    'rejects an image ingredient bound to video endpoint %s',
    async (endpoint) => {
      const f = await fixture(3, undefined, endpoint, IngredientCategory.IMAGE);
      await expect(f.run()).rejects.toThrow('CRUN_BYOK_USAGE_IDENTITY_INVALID');
      await f.assertCount(0);
    },
  );
  it('two concurrent consumers commit exactly one ledger and Activity', async () => {
    const f = await fixture();
    await Promise.all([f.run(), f.run()]);
    await f.assertCount(1);
  });
});
