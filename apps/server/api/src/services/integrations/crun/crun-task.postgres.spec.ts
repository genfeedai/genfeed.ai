import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { persistSubmissionFailure } from '@api/helpers/utils/credits/persist-submission-failure.util';
import type { ByokService } from '@api/services/byok/byok.service';
import type { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import type { CrunPreparedTask } from '@api/services/integrations/crun/crun-task.schema';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, IngredientStatus } from '@genfeedai/contracts';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { z } from 'zod';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

function jsonObject(
  value: unknown,
): import('@genfeedai/prisma').Prisma.InputJsonObject {
  return z.record(z.string(), z.json()).parse(toPrismaJson(value));
}

describe('Crun durable PostgreSQL submission and leases', () => {
  const schema = `crun_${randomUUID().replaceAll('-', '')}`;
  let pool: Pool;
  let prisma: PrismaClient;
  let service: CrunTaskService;
  const createTask = vi.fn();
  const taskInfo = vi.fn();
  const key = 'isolated-fixture-key';
  const fingerprint = createHash('sha256').update(key).digest('hex');
  beforeAll(async () => {
    const connectionString = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;
    if (!connectionString)
      throw new Error('Dedicated local Crun PostgreSQL fixture required');
    const url = new URL(connectionString);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Only loopback PostgreSQL fixtures allowed');
    pool = new Pool({ connectionString });
    const sql = readFileSync(
      new URL(
        '../../../../../../../packages/prisma/prisma/migrations/20261001120000_add_crun_generation_tasks/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await pool.query(
      `CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"; ${sql}`,
    );
    await pool.query(
      `CREATE TABLE "${schema}"."models" ("id" text PRIMARY KEY, "key" text, "isActive" boolean, "isDeleted" boolean, "reviewedProviderContractVersion" text, "pendingProviderContractVersion" text, "organizationId" text)`,
    );
    await pool.query(
      `INSERT INTO "${schema}"."models" VALUES ('model', 'crun/google/nano-banana-pro', true, false, 'contract-v1', NULL, NULL)`,
    );
    await pool.query(
      `CREATE TYPE "${schema}"."IngredientStatus" AS ENUM (${Object.values(
        IngredientStatus,
      )
        .map((status) => `'${status}'`)
        .join(',')})`,
    );
    await pool.query(
      `CREATE TABLE "${schema}"."ingredients" ("id" text PRIMARY KEY, "organizationId" text, "isDeleted" boolean DEFAULT false, "userId" text, "brandId" text, "generationBilling" jsonb, "status" "${schema}"."IngredientStatus" DEFAULT 'PROCESSING', "updatedAt" timestamp(3) DEFAULT now())`,
    );
    await pool.query(
      `CREATE TYPE "${schema}"."CreditReservationStatus" AS ENUM ('RESERVED','SETTLED','RELEASED','EXPIRED')`,
    );
    await pool.query(
      `CREATE TABLE "${schema}"."credit_reservations" ("id" text PRIMARY KEY, "organizationId" text, "isDeleted" boolean DEFAULT false, "status" "${schema}"."CreditReservationStatus", "actorUserId" text, "metadata" jsonb, "amount" double precision, "workloadId" text, "workloadType" text DEFAULT 'media-generation')`,
    );
    await pool.query(
      `INSERT INTO "${schema}"."credit_reservations" ("id","organizationId","isDeleted","status") VALUES ('funded-group', 'fixture-org', false, 'RESERVED'), ('fixture-reservation', 'fixture-org', false, 'RESERVED')`,
    );
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    });
    service = new CrunTaskService(
      prisma as unknown as PrismaService,
      {
        lookupApiKey: vi.fn().mockResolvedValue(undefined),
      } as unknown as ByokService,
      {
        get: (name: string) => (name === 'CRUN_ENABLED' ? 'true' : key),
      } as ConfigService,
      { createTask, taskInfo } as unknown as CrunClient,
    );
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });
  function frozenQuote(outputs = 1) {
    const result = quoteModelBillablePricing(
      billableProfile({
        key: 'crun/google/nano-banana-pro',
        provider: 'crun',
        cost: 3,
      }),
      {
        modelKey: 'crun/google/nano-banana-pro',
        provider: 'crun',
        outputs,
        requests: outputs,
      },
      1,
      new Date().toISOString(),
    );
    if (result.status !== 'priced') throw new Error('Invalid fixture pricing');
    return {
      ...result.snapshot,
      providerQuote: {
        provider: 'crun',
        estimated: false,
        providerCreditsPerTask: '8',
        quoteHash: 'a'.repeat(64),
        inputHash: 'b'.repeat(64),
        contractVersion: 'contract-v1',
        creditsPerUsd: '1000',
        acquisitionRateVersion: 'fixture-rate',
        credentialSource: 'hosted',
        credentialId: null,
        credentialFingerprint: fingerprint,
      },
    };
  }
  async function row(overrides: Record<string, unknown> = {}) {
    const ingredientId = randomUUID();
    const quote = frozenQuote();
    await pool.query(
      `INSERT INTO "${schema}"."ingredients" ("id","organizationId","userId") VALUES ($1,'fixture-org','fixture-user')`,
      [ingredientId],
    );
    await pool.query(
      `UPDATE "${schema}"."credit_reservations" SET "actorUserId"='fixture-user', "workloadId"=$1, "amount"=$2, "metadata"=$3 WHERE "id"='fixture-reservation'`,
      [ingredientId, quote.credits, JSON.stringify({ modelQuote: quote })],
    );
    return prisma.crunGenerationTask.create({
      data: {
        organizationId: 'fixture-org',
        userId: 'fixture-user',
        ingredientId,
        reservationId: 'fixture-reservation',
        modelKey: 'crun/google/nano-banana-pro',
        endpoint: 'google/nano-banana-pro',
        contractVersion: 'contract-v1',
        quoteId: randomUUID(),
        outputIndex: 0,
        inputHash: 'b'.repeat(64),
        inputMetadata: { referenceCount: 0, intentHash: 'd'.repeat(64) },
        quoteSnapshot: jsonObject(quote),
        fundingBinding: { kind: 'reservation' },
        credentialSource: 'hosted',
        credentialFingerprint: fingerprint,
        ...overrides,
      },
    });
  }
  it('concurrent submitters issue exactly one paid request and retain opaque acceptance', async () => {
    createTask.mockResolvedValue({
      isValid: true,
      data: { taskId: `ID/${randomUUID()}` },
    });
    const prepared = await row();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.submit(prepared, {
          model: prepared.endpoint,
          input: { prompt: 'fixture' },
        }),
      ),
    );
    expect(results.filter((result) => result.isSubmitted)).toHaveLength(1);
    expect(createTask).toHaveBeenCalledTimes(1);
    const stored = await service.findForIngredient(
      prepared.organizationId,
      prepared.ingredientId,
    );
    expect(stored?.providerTaskId).toMatch(/^ID\//);
    expect(stored?.state).toBe('pending');
    expect(
      await service.findForIngredient('foreign-org', prepared.ingredientId),
    ).toBeNull();
  });
  it('concurrent worker claims grant one lease per due row', async () => {
    const now = new Date();
    const due = await row({
      state: 'running',
      providerTaskId: randomUUID(),
      nextPollAt: now,
      deadlineAt: new Date(now.getTime() + 60000),
    });
    const claims = await Promise.all([
      service.claimDue(now),
      service.claimDue(now),
      service.claimDue(now),
    ]);
    expect(claims.flat().filter((task) => task.id === due.id)).toHaveLength(1);
    const stored = await service.findForIngredient(
      due.organizationId,
      due.ingredientId,
    );
    expect(stored?.version).toBe(1);
    expect(stored?.leaseUntil?.getTime()).toBe(now.getTime() + 60000);
  });
  it('restart after submitting cannot re-create and preserves ambiguous hold evidence', async () => {
    const count = createTask.mock.calls.length;
    const crashed = await row({
      state: 'submitting',
      submittedAt: new Date(),
      nextPollAt: new Date(),
    });
    const claimed = (await service.claimDue()).find(
      (task) => task.id === crashed.id,
    );
    if (!claimed) throw new Error('Missing restart claim');
    await service.poll(claimed);
    const stored = await service.findForIngredient(
      crashed.organizationId,
      crashed.ingredientId,
    );
    expect(stored?.state).toBe('recovery-required');
    expect(stored?.recoveryCode).toBe('CRUN_ACCEPTANCE_AMBIGUOUS');
    if (!stored) throw new Error('Missing durable task');
    await service.submit(stored, {
      model: crashed.endpoint,
      input: { prompt: 'fixture' },
    });
    expect(createTask).toHaveBeenCalledTimes(count);
    expect(stored?.reservationId).toBe('fixture-reservation');
  });
  it('prepares every funded output atomically and rolls back a foreign binding before dispatch', async () => {
    const quoteId = randomUUID();
    const quote = frozenQuote(4);
    const outputs: CrunPreparedTask[] = Array.from(
      { length: 4 },
      (_, outputIndex) => ({
        organizationId: 'fixture-org',
        userId: 'fixture-user',
        ingredientId: randomUUID(),
        reservationId: 'funded-group',
        modelKey: 'crun/google/nano-banana-pro',
        endpoint: 'google/nano-banana-pro',
        contractVersion: 'contract-v1',
        quoteId,
        outputIndex,
        inputHash: 'b'.repeat(64),
        inputMetadata: { referenceCount: 0, intentHash: 'd'.repeat(64) },
        quoteSnapshot: jsonObject(quote),
        fundingBinding: { kind: 'reservation' as const },
        credentialSource: 'hosted' as const,
        credentialId: null,
        credentialFingerprint: fingerprint,
      }),
    );
    for (const input of outputs)
      await pool.query(
        `INSERT INTO "${schema}"."ingredients" ("id","organizationId","userId","generationBilling") VALUES ($1, $2, 'fixture-user', $3)`,
        [
          input.ingredientId,
          input.organizationId,
          JSON.stringify({
            kind: 'quote-group',
            reservationId: 'funded-group',
            outputIndex: input.outputIndex,
          }),
        ],
      );
    await pool.query(
      `UPDATE "${schema}"."credit_reservations" SET "actorUserId"='fixture-user', "amount"=$1, "metadata"=$2 WHERE "id"='funded-group'`,
      [
        quote.credits,
        JSON.stringify({
          modelQuote: quote,
          boundOutputIds: outputs.map((input) => input.ingredientId),
        }),
      ],
    );
    const count = createTask.mock.calls.length;
    expect(await service.prepareTasks(outputs)).toHaveLength(4);
    expect(await prisma.crunGenerationTask.count({ where: { quoteId } })).toBe(
      4,
    );
    expect(createTask).toHaveBeenCalledTimes(count);
    const rejectedQuote = randomUUID();
    const rejected = outputs.map((input) => ({
      ...input,
      quoteId: rejectedQuote,
      ingredientId: randomUUID(),
    }));
    for (const input of rejected.slice(0, 3))
      await pool.query(
        `INSERT INTO "${schema}"."ingredients" ("id","organizationId","userId","generationBilling") VALUES ($1, $2, 'fixture-user', $3)`,
        [
          input.ingredientId,
          input.organizationId,
          JSON.stringify({
            kind: 'quote-group',
            reservationId: 'funded-group',
            outputIndex: input.outputIndex,
          }),
        ],
      );
    await pool.query(
      `INSERT INTO "${schema}"."ingredients" ("id","organizationId","userId") VALUES ($1, 'foreign-org', 'fixture-user')`,
      [rejected[3].ingredientId],
    );
    await pool.query(
      `UPDATE "${schema}"."credit_reservations" SET "metadata"=$1 WHERE "id"='funded-group'`,
      [
        JSON.stringify({
          modelQuote: quote,
          boundOutputIds: rejected.map((input) => input.ingredientId),
        }),
      ],
    );
    await expect(service.prepareTasks(rejected)).rejects.toMatchObject({
      response: { code: 'CRUN_TASK_BINDING_INVALID' },
    });
    expect(
      await prisma.crunGenerationTask.count({
        where: { quoteId: rejectedQuote },
      }),
    ).toBe(0);
  });
  it('database uniqueness rejects duplicate quote outputs and provider IDs', async () => {
    const first = await row({ providerTaskId: randomUUID() });
    await expect(row({ quoteId: first.quoteId })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      row({ providerTaskId: first.providerTaskId }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
  async function byokRow() {
    const receipt = {
      kind: 'byok' as const,
      state: 'pending' as const,
      userId: 'fixture-user',
      amount: 3,
      source: ActivitySource.IMAGE_GENERATION,
      description: 'BYOK race',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      submissionIntentProvider: 'crun',
    };
    const { kind: _kind, state: _state, ...immutable } = receipt;
    const base = frozenQuote();
    const snapshot = {
      ...base,
      providerQuote: {
        ...base.providerQuote,
        credentialSource: 'byok',
        creditsPerUsd: null,
        acquisitionRateVersion: null,
      },
    };
    const prepared = await row({
      reservationId: null,
      credentialSource: 'byok',
      quoteSnapshot: jsonObject(snapshot),
      fundingBinding: { kind: 'byok', receipt: immutable },
    });
    await pool.query(
      `UPDATE "${schema}"."ingredients" SET "generationBilling"=$2 WHERE "id"=$1`,
      [prepared.ingredientId, JSON.stringify(receipt)],
    );
    const byokTasks = new CrunTaskService(
      prisma as unknown as PrismaService,
      {
        lookupApiKey: async () => ({ apiKey: key }),
        lookupRetainedCrunApiKey: async () => ({ apiKey: key }),
      } as never,
      {
        get: (name: string) => (name === 'CRUN_ENABLED' ? 'true' : key),
      } as never,
      { createTask, taskInfo } as never,
    );
    return { prepared, byokTasks };
  }
  it('a committed BYOK failure transaction prevents a later submission claim and POST', async () => {
    const { prepared, byokTasks } = await byokRow();
    const before = createTask.mock.calls.length;
    expect(
      await persistSubmissionFailure(
        prisma as unknown as PrismaService,
        { id: prepared.ingredientId, organizationId: prepared.organizationId },
        { status: IngredientStatus.FAILED },
        false,
      ),
    ).toEqual({ count: 1 });
    await expect(
      byokTasks.submit(prepared, {
        model: prepared.endpoint,
        input: { prompt: 'fixture' },
      }),
    ).rejects.toThrow();
    expect(createTask.mock.calls.length).toBe(before);
    const saved = await prisma.ingredient.findFirst({
      where: {
        id: prepared.ingredientId,
        organizationId: prepared.organizationId,
        isDeleted: false,
      },
      select: { generationBilling: true },
    });
    expect(saved?.generationBilling).toMatchObject({
      state: 'failed',
      confirmedFailure: { kind: 'submission-rejected', provider: 'crun' },
    });
  });
  it('a submission claim committed before the failure barrier keeps BYOK funding intact', async () => {
    const { prepared, byokTasks } = await byokRow();
    let accept: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const posted = new Promise<void>((resolve) => {
      reached = resolve;
    });
    createTask.mockImplementationOnce(async () => {
      reached();
      await new Promise<void>((resolve) => {
        accept = resolve;
      });
      return { isValid: true, data: { taskId: randomUUID() } };
    });
    const submission = byokTasks.submit(prepared, {
      model: prepared.endpoint,
      input: { prompt: 'fixture' },
    });
    await posted;
    try {
      expect(
        await persistSubmissionFailure(
          prisma as unknown as PrismaService,
          {
            id: prepared.ingredientId,
            organizationId: prepared.organizationId,
          },
          { status: IngredientStatus.FAILED },
          true,
        ),
      ).toEqual({ count: 0 });
    } finally {
      accept();
    }
    expect((await submission).isSubmitted).toBe(true);
    const saved = await prisma.ingredient.findFirst({
      where: {
        id: prepared.ingredientId,
        organizationId: prepared.organizationId,
        isDeleted: false,
      },
      select: { generationBilling: true },
    });
    expect(saved?.generationBilling).toMatchObject({ state: 'pending' });
  });
  it('persists proven gate deferral once and never resubmits after restart', async () => {
    createTask.mockResolvedValueOnce({
      isValid: false,
      disposition: 'deferred',
      reasonCode: 'CRUN_RATE_LIMITED',
      retryAfterMs: 10000,
    });
    const prepared = await row();
    const before = createTask.mock.calls.length;
    await service.submit(prepared, {
      model: prepared.endpoint,
      input: { prompt: 'fixture' },
    });
    const saved = await service.findForIngredient(
      prepared.organizationId,
      prepared.ingredientId,
    );
    expect(saved).toMatchObject({
      state: 'provider-failed',
      providerTaskId: null,
      terminalReceipt: { isAccepted: false, credits: '0' },
      nextMediaAttemptAt: null,
    });
    expect(saved?.nextAccountingAttemptAt).toBeInstanceOf(Date);
    if (!saved) throw new Error('Missing durable refusal');
    await service.submit(saved, {
      model: prepared.endpoint,
      input: { prompt: 'fixture' },
    });
    expect(createTask.mock.calls.length).toBe(before + 1);
  });
  it('claims at most four immediate leases and preserves separate phase deadlines across restart', async () => {
    const now = new Date();
    await prisma.crunGenerationTask.updateMany({
      where: { organizationId: 'fixture-org', isDeleted: false },
      data: { nextPollAt: null },
    });
    const due = await Promise.all(
      Array.from({ length: 5 }, () =>
        row({
          state: 'provider-success',
          providerTaskId: randomUUID(),
          terminalReceipt: { status: 'success', credits: '8' },
          nextAccountingAttemptAt: now,
          nextMediaAttemptAt: new Date(now.getTime() + 60000),
          nextPollAt: now,
        }),
      ),
    );
    const claimed = await service.claimDue(now);
    expect(claimed.length).toBeLessThanOrEqual(4);
    expect(
      claimed.filter((item) =>
        due.some((candidate) => candidate.id === item.id),
      ),
    ).toHaveLength(4);
    const restarted = new CrunTaskService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    const stored = await restarted.findForIngredient(
      due[0].organizationId,
      due[0].ingredientId,
    );
    expect(stored?.nextAccountingAttemptAt).toEqual(now);
    expect(stored?.nextMediaAttemptAt?.getTime()).toBe(now.getTime() + 60000);
    const next = await restarted.claimDue(now);
    expect(
      next.filter((item) => due.some((candidate) => candidate.id === item.id)),
    ).toHaveLength(1);
  });
});

describe('Crun shared Redis admission with two process-equivalent clients', () => {
  let first: import('ioredis').default;
  let second: import('ioredis').default;
  let serviceA: import('@api/services/cache/cache.service').CacheService;
  let serviceB: import('@api/services/cache/cache.service').CacheService;
  const fingerprint = createHash('sha256').update(randomUUID()).digest('hex');
  const key = `crun:requests:${fingerprint}`;
  beforeAll(async () => {
    const url = process.env.CRUN_TEST_REDIS_URL;
    if (
      !url ||
      !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
    )
      throw new Error('Dedicated loopback Redis fixture required');
    const { default: Redis } =
      await vi.importActual<typeof import('ioredis')>('ioredis');
    first = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    second = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      lazyConnect: true,
    });
    await Promise.all([first.connect(), second.connect()]);
    const { CacheService } = await import('@api/services/cache/cache.service');
    const make = (client: import('ioredis').default) =>
      new CacheService(
        {
          instance: client,
          isReady: true,
        } as unknown as import('@api/services/cache/cache-client.service').CacheClientService,
        {} as import('@api/services/cache/cache-tags.service').CacheTagsService,
        {
          warn: vi.fn(),
        } as unknown as import('@libs/logger/logger.service').LoggerService,
      );
    serviceA = make(first);
    serviceB = make(second);
  });
  afterAll(async () => {
    if (first?.status === 'ready') await first.del(key);
    first?.disconnect();
    second?.disconnect();
  });
  it('atomic gate admits exactly 20 across concurrent clients, isolates keys and expires old slots', async () => {
    const results = await Promise.all(
      Array.from({ length: 80 }, (_, index) =>
        (index % 2 ? serviceA : serviceB).claimCrunRequestSlot(fingerprint),
      ),
    );
    expect(results.filter((result) => result?.isAdmitted)).toHaveLength(20);
    expect(
      results.filter((result) => result && !result.isAdmitted),
    ).toHaveLength(60);
    expect(await first.zcard(key)).toBe(20);
    expect(await first.ttl(key)).toBeGreaterThan(0);
    const other = createHash('sha256').update(randomUUID()).digest('hex');
    expect((await serviceB.claimCrunRequestSlot(other))?.isAdmitted).toBe(true);
    await first.del(`crun:requests:${other}`);
    const [seconds, micros] = await first.time();
    const now = Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
    const members = await first.zrange(key, 0, -1);
    await Promise.all(
      members.map((member) => first.zadd(key, now - 10001, member)),
    );
    expect((await serviceA.claimCrunRequestSlot(fingerprint))?.isAdmitted).toBe(
      true,
    );
    expect(await first.zcard(key)).toBe(1);
  });
});
