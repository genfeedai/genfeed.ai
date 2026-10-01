import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ByokService } from '@api/services/byok/byok.service';
import type { CrunClient } from '@api/services/integrations/crun/crun-client.service';
import { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

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
      `CREATE TABLE "${schema}"."models" ("id" text PRIMARY KEY, "key" text, "isActive" boolean, "isDeleted" boolean, "reviewedProviderContractVersion" text)`,
    );
    await pool.query(
      `INSERT INTO "${schema}"."models" VALUES ('model', 'crun/google/nano-banana-pro', true, false, 'contract-v1')`,
    );
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
    });
    service = new CrunTaskService(
      prisma as unknown as PrismaService,
      {
        lookupApiKeyWithIdentity: vi.fn().mockResolvedValue(undefined),
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
  async function row(overrides: Record<string, unknown> = {}) {
    return prisma.crunGenerationTask.create({
      data: {
        organizationId: 'fixture-org',
        userId: 'fixture-user',
        ingredientId: randomUUID(),
        reservationId: 'fixture-reservation',
        modelKey: 'crun/google/nano-banana-pro',
        endpoint: 'google/nano-banana-pro',
        contractVersion: 'contract-v1',
        quoteId: randomUUID(),
        outputIndex: 0,
        inputHash: 'frozen-hash',
        inputMetadata: { referenceCount: 0 },
        quoteSnapshot: {},
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
    await service.poll(crashed);
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
  it('database uniqueness rejects duplicate quote outputs and provider IDs', async () => {
    const first = await row({ providerTaskId: randomUUID() });
    await expect(row({ quoteId: first.quoteId })).rejects.toMatchObject({
      code: 'P2002',
    });
    await expect(
      row({ providerTaskId: first.providerTaskId }),
    ).rejects.toMatchObject({ code: 'P2002' });
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
