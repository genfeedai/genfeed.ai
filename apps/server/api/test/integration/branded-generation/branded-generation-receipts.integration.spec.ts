import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { PrismaClient } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';

const configured = process.env.BRANDED_GENERATION_TEST_DATABASE_URL;
let baseUrl: string;
try {
  if (!configured) throw new Error();
  const parsed = new URL(configured);
  if (parsed.search || !/test/i.test(decodeURIComponent(parsed.pathname)))
    throw new Error();
  baseUrl = assertIsolatedDatabaseUrl(configured);
} catch {
  throw new Error('BRANDED_GENERATION_TEST_DATABASE_URL required');
}
const schema = `branded_receipts_test_${randomUUID().replaceAll('-', '')}`;
if (!/^branded_receipts_test_[0-9a-f]{32}$/.test(schema))
  throw new Error('Invalid fixture schema');
const prismaDirectory = resolve('../../../packages/prisma');
const migrationDirectory = resolve(prismaDirectory, 'prisma/migrations');
const migrationNames = readdirSync(migrationDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const applicationNames = [0, 1].map((index) => `${schema}_${index}`);
const scoped = new URL(baseUrl);
scoped.searchParams.set('schema', schema);
let control: Client;
let observer: Client;
const clients: PrismaClient[] = [];
const services: BrandedGenerationReceiptsService[] = [];
const relocations: BrandRelocationService[] = [];
const outstanding = new Set<Promise<unknown>>();
const barriers = new Set<number>();
const originalKey = process.env.TOKEN_ENCRYPTION_KEY;
let schemaCreated = false;
function track<T>(operation: Promise<T>): Promise<T> {
  outstanding.add(operation);
  void operation.then(
    () => outstanding.delete(operation),
    () => outstanding.delete(operation),
  );
  return operation;
}
function outcome<T>(operation: Promise<T>) {
  return track(operation).then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  );
}
async function seed() {
  const [
    owner,
    member,
    restricted,
    inactive,
    source,
    destination,
    brand,
    fallback,
    destinationBrand,
  ] = Array.from({ length: 9 }, () => randomUUID());
  const ownerRole = await clients[0].role.upsert({
    where: { key: 'owner' },
    create: { key: 'owner', label: 'Owner' },
    update: {},
  });
  const memberRole = await clients[0].role.upsert({
    where: { key: 'user' },
    create: { key: 'user', label: 'User' },
    update: {},
  });
  await clients[0].user.createMany({
    data: [owner, member, restricted, inactive].map((id) => ({
      id,
      handle: `fixture-${id}`,
    })),
  });
  await clients[0].organization.createMany({
    data: [source, destination].map((id) => ({
      id,
      label: id,
      slug: id,
      userId: owner,
    })),
  });
  await clients[0].brand.createMany({
    data: [brand, fallback, destinationBrand].map((id) => ({
      id,
      label: id,
      slug: id,
      userId: owner,
      organizationId: id === destinationBrand ? destination : source,
    })),
  });
  for (const organizationId of [source, destination])
    await clients[0].member.create({
      data: {
        userId: owner,
        organizationId,
        roleId: ownerRole.id,
        currentBrandId: organizationId === source ? brand : destinationBrand,
      },
    });
  await clients[0].member.create({
    data: {
      userId: member,
      organizationId: source,
      roleId: memberRole.id,
      currentBrandId: brand,
    },
  });
  await clients[0].member.create({
    data: {
      userId: restricted,
      organizationId: source,
      roleId: memberRole.id,
      currentBrandId: fallback,
      brands: { connect: { id: fallback } },
    },
  });
  await clients[0].member.create({
    data: {
      userId: inactive,
      organizationId: source,
      roleId: memberRole.id,
      currentBrandId: brand,
      isActive: false,
    },
  });
  const actor = { actorId: owner, organizationId: source, brandId: brand };
  return {
    actor,
    owner,
    member,
    restricted,
    inactive,
    source,
    destination,
    brand,
    fallback,
    destinationBrand,
    actingUser: { userId: owner, isSuperAdmin: false },
  };
}
function input(
  actor: BrandedGenerationActorV1,
  originalPrompt = 'exact fixture prompt',
): BrandedGenerationInputV1 {
  return {
    schemaVersion: 1,
    ...actor,
    requestKey: randomUUID(),
    candidateIndex: 0,
    surface: 'api',
    contentType: 'post',
    format: 'text',
    mode: 'raw',
    originalPrompt,
    provider: 'fixture-provider',
    model: 'fixture-model',
    generationParameters: {},
    knowledgeSourceIds: [],
    knowledgeSpaceIds: [],
  };
}
function resolution(
  receipt: BrandedGenerationReceiptV1,
): BrandedGenerationResolutionV1 {
  return {
    schemaVersion: 1,
    mode: 'raw',
    status: 'resolved',
    snapshot: null,
    layers: [],
    diagnostics: [],
    compiledPrompt: 'compiled fixture',
    originalPromptHash: receipt.prompts.original.contentHash,
    learning: {
      schemaVersion: 1,
      brandFeedback: { status: 'not_applicable', sourceIds: [] },
      global: {
        status: 'not_applicable',
        scope: { format: 'text', objective: 'engagement' },
      },
      privateAccount: {
        mode: 'no_destination',
        configVersion: 'v1',
        synthetic: false,
        application: {
          status: 'unavailable',
          reasonCodes: ['no_destination'],
          privatePolicyApplied: false,
          sharedReleaseApplied: false,
          revalidatedAt: '2026-10-01T17:00:00.000Z',
        },
      },
    },
  };
}
async function counts(actor: BrandedGenerationActorV1) {
  const where = {
    organizationId: actor.organizationId,
    brandId: actor.brandId,
  };
  return Promise.all([
    clients[0].brandedGenerationReceipt.count({ where }),
    clients[0].brandedGenerationReceiptEvent.count({ where }),
    clients[0].generationPromptSnapshot.count({ where }),
  ]);
}
async function rollbackFailure(
  run: () => Promise<unknown>,
  expected: { code: string; message?: string; constraint?: string },
) {
  await control.query('BEGIN');
  let failure: unknown;
  try {
    await run();
    await control.query('COMMIT');
  } catch (error) {
    failure = error;
  } finally {
    await control.query('ROLLBACK');
  }
  expect(failure).toMatchObject(expected);
}
async function waitAdvisory(applicationName: string, key: number) {
  await expect
    .poll(
      async () => {
        const result = await observer.query(
          `SELECT a.pid FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.application_name=$1 AND l.locktype='advisory' AND NOT l.granted AND l.classid=0 AND l.objid=$2 AND l.objsubid=1`,
          [applicationName, key],
        );
        return result.rowCount;
      },
      { timeout: 2000, interval: 10 },
    )
    .toBe(1);
}
async function waitBlocked(applicationName: string, blockerName: string) {
  await expect
    .poll(
      async () => {
        const result = await observer.query(
          `SELECT a.pid FROM pg_stat_activity a WHERE a.application_name=$1 AND EXISTS (SELECT 1 FROM pg_stat_activity b WHERE b.application_name=$2 AND b.pid=ANY(pg_blocking_pids(a.pid)))`,
          [applicationName, blockerName],
        );
        return result.rowCount;
      },
      { timeout: 2000, interval: 10 },
    )
    .toBe(1);
}
async function release(key: number) {
  await control.query('SELECT pg_advisory_unlock($1::bigint)', [key]);
  barriers.delete(key);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function holdBarrier(key: number) {
  await control.query('SELECT pg_advisory_lock($1::bigint)', [key]);
  barriers.add(key);
  const releaseSignal = deferred();
  const unlocked = releaseSignal.promise.then(() => release(key));
  return {
    async release() {
      releaseSignal.resolve();
      await unlocked;
    },
  };
}

// Missing relocation history guard is an active acceptance failure, never a skip.
describe('branded receipt full-migration service and relocation acceptance', () => {
  beforeAll(async () => {
    for (const name of migrationNames) {
      const sql = readFileSync(
        resolve(migrationDirectory, name, 'migration.sql'),
        'utf8',
      );
      if (/(?:"public"|\bpublic)\s*\./i.test(sql))
        throw new Error(
          'Fixture migration scope requires planner revalidation',
        );
    }
    control = new Client({
      connectionString: baseUrl,
      application_name: `${schema}_control`,
    });
    await control.connect();
    await control.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    try {
      execFileSync('bun', ['x', 'prisma', 'migrate', 'deploy'], {
        cwd: prismaDirectory,
        env: { ...process.env, DATABASE_URL: scoped.toString() },
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: 'pipe',
      });
    } catch {
      throw new Error('Fixture full migration deployment failed');
    }
    await control.query(`SET search_path TO "${schema}", public`);
    observer = new Client({
      connectionString: baseUrl,
      application_name: `${schema}_observer`,
      options: `-c search_path=${schema},public`,
    });
    await observer.connect();
    for (const connection of [control, observer])
      expect(
        (await connection.query('SELECT current_schema() AS schema')).rows[0]
          .schema,
      ).toBe(schema);
    const applied = await control.query(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
    );
    expect(applied.rows.map((row) => row.migration_name)).toEqual(
      migrationNames,
    );
    expect(migrationNames).toContain(
      '20261001170000_branded_generation_receipts',
    );
    for (const row of applied.rows) {
      expect(row.finished_at).not.toBeNull();
      expect(row.rolled_back_at).toBeNull();
    }
    process.env.TOKEN_ENCRYPTION_KEY =
      'branded-receipt-isolated-integration-test-only';
    for (const application_name of applicationNames) {
      const prisma = new PrismaClient({
        adapter: new PrismaPg(
          {
            connectionString: scoped.toString(),
            options: `-c search_path=${schema},public`,
            application_name,
            max: 2,
          },
          { schema },
        ),
      });
      clients.push(prisma);
      const current = await prisma.$queryRaw<
        Array<{ schema: string }>
      >`SELECT current_schema() AS schema`;
      expect(current[0].schema).toBe(schema);
      const access = new BrandedGenerationReceiptAccessService();
      services.push(
        new BrandedGenerationReceiptsService(
          prisma as unknown as PrismaService,
          access,
          new BrandedGenerationPromptStoreService(access),
        ),
      );
      relocations.push(
        new BrandRelocationService(
          prisma as unknown as PrismaService,
          {
            log: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          } as never,
          {
            invalidate: vi.fn().mockResolvedValue(undefined),
            invalidateByTags: vi.fn().mockResolvedValue(undefined),
          } as never,
        ),
      );
    }
  }, 180000);
  afterAll(async () => {
    try {
      try {
        await Promise.allSettled([...barriers].map((key) => release(key)));
        await Promise.allSettled([...outstanding]);
      } finally {
        try {
          await Promise.all(clients.map((client) => client.$disconnect()));
        } finally {
          await observer?.end();
        }
      }
    } finally {
      if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
      if (control) {
        try {
          if (schemaCreated)
            await control.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await control.end();
        }
      }
    }
  });

  it('serializes same-input create, rejects changed payloads, and isolates other scopes', async () => {
    const s = await seed();
    const value = input(s.actor);
    const results = await Promise.all(
      services.map((service) => service.create(value)),
    );
    expect(new Set(results.map((result) => result.receipt.id)).size).toBe(1);
    expect(
      new Set(results.map((result) => result.receipt.requestHash)).size,
    ).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await counts(s.actor)).toEqual([1, 1, 1]);
    for (const patch of [
      { originalPrompt: 'changed' },
      { provider: 'changed' },
      { model: 'changed' },
      { generationParameters: { seed: 2 } },
    ])
      await expect(services[0].create({ ...value, ...patch })).rejects.toThrow(
        'request_payload_conflict',
      );
    expect(await counts(s.actor)).toEqual([1, 1, 1]);
    await services[0].create({ ...value, brandId: s.fallback });
    await services[0].create({
      ...value,
      organizationId: s.destination,
      brandId: s.destinationBrand,
    });
    expect(await counts({ ...s.actor, brandId: s.fallback })).toEqual([
      1, 1, 1,
    ]);
    expect(
      await counts({
        ...s.actor,
        organizationId: s.destination,
        brandId: s.destinationBrand,
      }),
    ).toEqual([1, 1, 1]);
  }, 60000);
  it.each(['', '  \t\n ', 'Café 😀\r\n'])(
    'retains exact encrypted original %j and real membership access',
    async (text) => {
      const s = await seed();
      const result = await services[0].create(
        input({ ...s.actor, actorId: s.member }, text),
      );
      expect(result.receipt.actorId).toBe(s.member);
      for (const actorId of [s.member, s.owner])
        expect(
          await services[0].readPrompt(
            { ...s.actor, actorId },
            result.receipt.id,
            'original',
          ),
        ).toMatchObject({ status: 'retained', text });
      const ordinary = randomUUID();
      await clients[0].user.create({
        data: { id: ordinary, handle: ordinary },
      });
      const role = await clients[0].role.findUniqueOrThrow({
        where: { key: 'user' },
      });
      await clients[0].member.create({
        data: {
          userId: ordinary,
          organizationId: s.source,
          roleId: role.id,
          currentBrandId: s.brand,
        },
      });
      expect(
        (
          await services[0].get(
            { ...s.actor, actorId: ordinary },
            result.receipt.id,
          )
        ).id,
      ).toBe(result.receipt.id);
      await expect(
        services[0].readPrompt(
          { ...s.actor, actorId: ordinary },
          result.receipt.id,
          'original',
        ),
      ).rejects.toThrow('receipt_access_denied');
      for (const actorId of [s.restricted, s.inactive])
        await expect(
          services[0].get({ ...s.actor, actorId }, result.receipt.id),
        ).rejects.toThrow('receipt_access_denied');
      const row = await clients[0].generationPromptSnapshot.findFirstOrThrow({
        where: {
          brandedGenerationReceiptId: result.receipt.id,
          organizationId: s.source,
          isDeleted: false,
        },
      });
      if (text) expect(row.ciphertext).not.toContain(text);
      expect(row.ciphertext).not.toContain('originalPrompt');
    },
    60000,
  );
  it('commits one competing revision and replays immutable event projections', async () => {
    const s = await seed();
    const current = (await services[0].create(input(s.actor))).receipt;
    const attempts = await Promise.all(
      services.map((service, index) =>
        outcome(
          service.cancel(s.actor, current.id, {
            operationKey: `cancel-${index}`,
            expectedRevision: 0,
          }),
        ),
      ),
    );
    const winner = attempts.find((attempt) => attempt.status === 'fulfilled');
    const loser = attempts.find((attempt) => attempt.status === 'rejected');
    if (winner?.status !== 'fulfilled' || loser?.status !== 'rejected')
      throw new Error('Expected exactly one committed mutation');
    expect(loser.reason).toMatchObject({ message: 'receipt_version_conflict' });
    const index = attempts.indexOf(winner);
    const events = await clients[0].brandedGenerationReceiptEvent.findMany({
      where: {
        receiptId: current.id,
        organizationId: s.source,
        isDeleted: false,
      },
      orderBy: { revision: 'asc' },
    });
    expect(events.map((event) => event.revision)).toEqual([0, 1]);
    expect(events[0].projection).toEqual(current);
    expect(events[1].projection).toEqual(winner.value.receipt);
    expect(
      await services[1].cancel(s.actor, current.id, {
        operationKey: `cancel-${index}`,
        expectedRevision: 0,
      }),
    ).toEqual({ receipt: winner.value.receipt, replayed: true });
    await expect(
      services[0].softDelete(s.actor, current.id, {
        operationKey: `cancel-${index}`,
        expectedRevision: 1,
      }),
    ).rejects.toThrow('request_payload_conflict');
    const row = await clients[0].brandedGenerationReceipt.findUniqueOrThrow({
      where: { id: current.id },
    });
    expect(row.revision).toBe(1);
    expect(row.state).toBe(winner.value.receipt.state);
    expect(row.projection).toEqual(winner.value.receipt);
    expect(
      await clients[0].brandedGenerationReceiptEvent.count({
        where: { receiptId: current.id, organizationId: s.source },
      }),
    ).toBe(2);
  }, 60000);
  it('rolls aggregate, event and prompt writes back on actual event-trigger failure', async () => {
    const s = await seed();
    await control.query(
      `CREATE FUNCTION fixture_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId"='${s.source}' THEN RAISE EXCEPTION 'fixture_event_insert_failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_event_failure BEFORE INSERT ON branded_generation_receipt_events FOR EACH ROW EXECUTE FUNCTION fixture_event_failure()`,
    );
    try {
      await expect(services[0].create(input(s.actor))).rejects.toThrow(
        'fixture_event_insert_failure',
      );
      expect(await counts(s.actor)).toEqual([0, 0, 0]);
    } finally {
      await control.query(
        'DROP TRIGGER fixture_event_failure ON branded_generation_receipt_events; DROP FUNCTION fixture_event_failure()',
      );
    }
    const current = (await services[0].create(input(s.actor))).receipt;
    await control.query(
      `CREATE FUNCTION fixture_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId"='${s.source}' THEN RAISE EXCEPTION 'fixture_event_insert_failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_event_failure BEFORE INSERT ON branded_generation_receipt_events FOR EACH ROW EXECUTE FUNCTION fixture_event_failure()`,
    );
    try {
      await expect(
        services[0].recordResolution(
          s.actor,
          current.id,
          { operationKey: 'resolve-fault', expectedRevision: 0 },
          resolution(current),
          'enhanced',
        ),
      ).rejects.toThrow('fixture_event_insert_failure');
      expect(await counts(s.actor)).toEqual([1, 1, 1]);
      expect(await services[0].get(s.actor, current.id)).toEqual(current);
    } finally {
      await control.query(
        'DROP TRIGGER fixture_event_failure ON branded_generation_receipt_events; DROP FUNCTION fixture_event_failure()',
      );
    }
  }, 60000);
  it('enforces production constraints and immutable rows in explicit rollback transactions', async () => {
    const s = await seed();
    const current = (await services[0].create(input(s.actor))).receipt;
    const before = await counts(s.actor);
    await rollbackFailure(
      () =>
        control.query(
          `INSERT INTO branded_generation_receipts(id,"organizationId","brandId","actorId","requestKey","candidateIndex","requestHash",state,mode,surface,projection,"createdAt","updatedAt") SELECT $1,"organizationId","brandId","actorId",$2,"candidateIndex","requestHash",state,mode,surface,projection || jsonb_build_object('id',$1::text,'requestKey',$2::text),"createdAt","updatedAt" FROM branded_generation_receipts WHERE id=$3`,
          [randomUUID(), randomUUID(), current.id],
        ),
      { code: 'P0001', message: 'receipt_event_required' },
    );
    for (const [column, value] of [
      ['requestHash', `sha256:${'b'.repeat(64)}`],
      ['organizationId', s.destination],
      ['brandId', s.fallback],
    ] as const)
      await rollbackFailure(
        () =>
          control.query(
            `UPDATE branded_generation_receipts SET "${column}"=$1 WHERE id=$2`,
            [value, current.id],
          ),
        { code: 'P0001', message: 'receipt_immutable' },
      );
    await rollbackFailure(
      () =>
        control.query(
          'UPDATE branded_generation_receipts SET revision=revision+2 WHERE id=$1',
          [current.id],
        ),
      { code: 'P0001', message: 'receipt_immutable' },
    );
    await rollbackFailure(
      () =>
        control.query('DELETE FROM branded_generation_receipts WHERE id=$1', [
          current.id,
        ]),
      { code: 'P0001', message: 'receipt_immutable' },
    );
    await rollbackFailure(
      () =>
        control.query(
          'DELETE FROM branded_generation_receipt_events WHERE "receiptId"=$1',
          [current.id],
        ),
      { code: 'P0001', message: 'receipt_event_immutable' },
    );
    for (const organizationId of [s.destination, s.source]) {
      const brandId =
        organizationId === s.destination ? s.destinationBrand : s.fallback;
      await rollbackFailure(
        () =>
          control.query(
            `INSERT INTO branded_generation_receipt_events(id,"receiptId","organizationId","brandId","actorId","operationKey","operationHash",revision,type,projection) SELECT $1,"receiptId",$2,$3,"actorId",$4,"operationHash",1,'cancel',projection FROM branded_generation_receipt_events WHERE "receiptId"=$5 AND revision=0`,
            [randomUUID(), organizationId, brandId, randomUUID(), current.id],
          ),
        {
          code: '23503',
          constraint: 'branded_generation_receipt_events_receipt_scope_fkey',
        },
      );
      await rollbackFailure(
        () =>
          control.query(
            `INSERT INTO generation_prompt_snapshots(id,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage") SELECT $1,$2,$3,"userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId",1,'compiled' FROM generation_prompt_snapshots WHERE "brandedGenerationReceiptId"=$4`,
            [randomUUID(), organizationId, brandId, current.id],
          ),
        {
          code: '23503',
          constraint: 'generation_prompt_snapshots_receipt_fkey',
        },
      );
    }
    for (const [column, value] of [
      ['format', 'forged'],
      ['contentHash', `sha256:${'b'.repeat(64)}`],
      ['ciphertext', `${'a'.repeat(32)}:aa:${'b'.repeat(32)}`],
    ] as const)
      await rollbackFailure(
        () =>
          control.query(
            `UPDATE generation_prompt_snapshots SET "${column}"=$1 WHERE "brandedGenerationReceiptId"=$2`,
            [value, current.id],
          ),
        { code: 'P0001', message: 'receipt_prompt_immutable' },
      );
    await rollbackFailure(
      () =>
        control.query(
          'DELETE FROM generation_prompt_snapshots WHERE "brandedGenerationReceiptId"=$1',
          [current.id],
        ),
      { code: 'P0001', message: 'receipt_prompt_immutable' },
    );
    await rollbackFailure(
      async () => {
        await control.query(
          `UPDATE branded_generation_receipts SET revision=1,state='cancelled',projection=projection || jsonb_build_object('revision',1,'state','cancelled') WHERE id=$1`,
          [current.id],
        );
        await control.query(
          `INSERT INTO branded_generation_receipt_events(id,"receiptId","organizationId","brandId","actorId","operationKey","operationHash",revision,type,projection) SELECT $1,"receiptId","organizationId","brandId","actorId",$2,"operationHash",1,'cancel',projection || jsonb_build_object('revision',1) FROM branded_generation_receipt_events WHERE "receiptId"=$3 AND revision=0`,
          [randomUUID(), randomUUID(), current.id],
        );
      },
      { code: 'P0001', message: 'receipt_event_required' },
    );
    expect(await counts(s.actor)).toEqual(before);
    expect(await services[0].get(s.actor, current.id)).toEqual(current);
    await services[0].softDelete(s.actor, current.id, {
      operationKey: 'delete',
      expectedRevision: 0,
    });
    await rollbackFailure(
      () =>
        control.query(
          'UPDATE branded_generation_receipts SET "isDeleted"=false,revision=revision+1 WHERE id=$1',
          [current.id],
        ),
      { code: 'P0001', message: 'receipt_immutable' },
    );
    await rollbackFailure(
      () =>
        control.query(
          `UPDATE generation_prompt_snapshots SET "isDeleted"=false,"retentionState"='retained',ciphertext=$1 WHERE "brandedGenerationReceiptId"=$2`,
          [`${'a'.repeat(32)}:aa:${'b'.repeat(32)}`, current.id],
        ),
      { code: 'P0001', message: 'receipt_prompt_immutable' },
    );
  }, 60000);
  it('purges payloads without erasing scoped uniqueness or immutable history', async () => {
    const s = await seed();
    const value = input(s.actor);
    const current = (await services[0].create(value)).receipt;
    const resolved = (
      await services[0].recordResolution(
        s.actor,
        current.id,
        { operationKey: 'resolve', expectedRevision: 0 },
        resolution(current),
        'enhanced',
      )
    ).receipt;
    const mutation = { operationKey: 'delete', expectedRevision: 1 };
    const result = await services[0].softDelete(s.actor, current.id, mutation);
    expect(await services[1].softDelete(s.actor, current.id, mutation)).toEqual(
      { receipt: result.receipt, replayed: true },
    );
    expect(await counts(s.actor)).toEqual([1, 3, 3]);
    const prompts = await clients[0].generationPromptSnapshot.findMany({
      where: {
        brandedGenerationReceiptId: current.id,
        organizationId: s.source,
      },
    });
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts)
      expect(prompt).toMatchObject({
        ciphertext: '',
        retentionState: 'purged',
        isDeleted: true,
      });
    const events = await clients[0].brandedGenerationReceiptEvent.findMany({
      where: { receiptId: current.id, organizationId: s.source },
      orderBy: { revision: 'asc' },
    });
    expect(events.map((event) => event.revision)).toEqual([0, 1, 2]);
    expect(events.every((event) => event.isDeleted)).toBe(true);
    expect(events[1].projection).toEqual(resolved);
    for (const operation of [
      () => services[0].get(s.actor, current.id),
      () => services[0].history(s.actor, current.id, { limit: 10 }),
      () => services[0].readPrompt(s.actor, current.id, 'original'),
    ])
      await expect(operation()).rejects.toThrow('receipt_not_found');
    expect((await services[0].list(s.actor, { limit: 10 })).items).toEqual([]);
    await expect(services[0].create(value)).rejects.toThrow('receipt_deleted');
    expect(await counts(s.actor)).toEqual([1, 3, 3]);
  }, 60000);
  it('requires the active relocation history guard for live and tombstoned receipts', async () => {
    const s = await seed();
    const current = (await services[0].create(input(s.actor))).receipt;
    for (const tombstoned of [false, true]) {
      if (tombstoned)
        await services[0].softDelete(s.actor, current.id, {
          operationKey: 'delete',
          expectedRevision: 0,
        });
      await expect(
        relocations[0].previewRelocation(s.brand, s.destination, s.actingUser),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        relocations[1].relocateToOrganization(
          s.brand,
          { organizationId: s.destination },
          s.actingUser,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        (await clients[0].brand.findUniqueOrThrow({ where: { id: s.brand } }))
          .organizationId,
      ).toBe(s.source);
      expect(await counts(s.actor)).toEqual(tombstoned ? [1, 2, 1] : [1, 1, 1]);
    }
    const empty = randomUUID();
    await clients[0].brand.create({
      data: {
        id: empty,
        label: empty,
        slug: empty,
        organizationId: s.source,
        userId: s.owner,
      },
    });
    await expect(
      relocations[0].previewRelocation(empty, s.destination, s.actingUser),
    ).resolves.toBeDefined();
    expect(
      (
        await relocations[0].relocateToOrganization(
          empty,
          { organizationId: s.destination },
          s.actingUser,
        )
      ).brand.organizationId,
    ).toBe(s.destination);
    expect(
      (await clients[0].brand.findUniqueOrThrow({ where: { id: s.fallback } }))
        .organizationId,
    ).toBe(s.source);
    const memberships = await clients[0].member.findMany({
      where: { organizationId: s.source, isDeleted: false },
      include: { currentBrand: true },
    });
    expect(
      memberships.every(
        (member) => member.currentBrand.organizationId === s.source,
      ),
    ).toBe(true);
  }, 60000);
  it('observes receipt-first Brand ownership before the relocation contender enters PostgreSQL', async () => {
    const s = await seed();
    const key = 461701;
    await control.query(
      `CREATE FUNCTION fixture_receipt_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."brandId"='${s.brand}' THEN PERFORM pg_advisory_xact_lock(${key}::bigint); END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_receipt_barrier BEFORE INSERT ON branded_generation_receipts FOR EACH ROW EXECUTE FUNCTION fixture_receipt_barrier()`,
    );
    const barrier = await holdBarrier(key);
    const creating = outcome(services[0].create(input(s.actor)));
    let moving: ReturnType<typeof outcome> | undefined;
    try {
      await waitAdvisory(applicationNames[0], key);
      const locks = await observer.query(
        `SELECT l.mode FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=$1 AND l.relation='brands'::regclass AND l.granted`,
        [applicationNames[0]],
      );
      expect(locks.rows).toContainEqual({ mode: 'RowShareLock' });
      moving = outcome(
        relocations[1].relocateToOrganization(
          s.brand,
          { organizationId: s.destination },
          s.actingUser,
        ),
      );
      await waitBlocked(applicationNames[1], applicationNames[0]);
    } finally {
      await barrier.release();
      await Promise.all([creating, moving]);
      await control.query(
        'DROP TRIGGER fixture_receipt_barrier ON branded_generation_receipts; DROP FUNCTION fixture_receipt_barrier()',
      );
    }
    const created = await creating;
    if (created.status !== 'fulfilled') throw created.reason;
    expect((await moving)?.status).toBe('rejected');
    expect(created.value.receipt.organizationId).toBe(s.source);
    expect(
      (await clients[0].brand.findUniqueOrThrow({ where: { id: s.brand } }))
        .organizationId,
    ).toBe(s.source);
    expect(await counts(s.actor)).toEqual([1, 1, 1]);
    expect(await counts({ ...s.actor, organizationId: s.destination })).toEqual(
      [0, 0, 0],
    );
  }, 60000);
  it('observes move-first Brand ownership and refuses an old-scope receipt after the move', async () => {
    const s = await seed();
    const key = 461702;
    await control.query(
      `CREATE FUNCTION fixture_move_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${s.brand}' AND NEW."organizationId" IS DISTINCT FROM OLD."organizationId" THEN PERFORM pg_advisory_xact_lock(${key}::bigint); END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_move_barrier AFTER UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION fixture_move_barrier()`,
    );
    const barrier = await holdBarrier(key);
    const moving = outcome(
      relocations[0].relocateToOrganization(
        s.brand,
        { organizationId: s.destination },
        s.actingUser,
      ),
    );
    let creating: ReturnType<typeof outcome> | undefined;
    try {
      await waitAdvisory(applicationNames[0], key);
      creating = outcome(services[1].create(input(s.actor)));
      await waitBlocked(applicationNames[1], applicationNames[0]);
    } finally {
      await barrier.release();
      await Promise.all([moving, creating]);
      await control.query(
        'DROP TRIGGER fixture_move_barrier ON brands; DROP FUNCTION fixture_move_barrier()',
      );
    }
    const moved = await moving;
    if (moved.status !== 'fulfilled') throw moved.reason;
    expect(moved.value.brand.organizationId).toBe(s.destination);
    const rejected = await creating;
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected')
      expect(rejected.reason).toMatchObject({
        message: 'receipt_access_denied',
      });
    expect(await counts(s.actor)).toEqual([0, 0, 0]);
    expect(await counts({ ...s.actor, organizationId: s.destination })).toEqual(
      [0, 0, 0],
    );
    const membership = await clients[0].member.findFirstOrThrow({
      where: { userId: s.owner, organizationId: s.source, isDeleted: false },
    });
    expect(membership.currentBrandId).toBe(s.fallback);
  }, 60000);
});
