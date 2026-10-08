import { brandAccessFixture } from '@api/shared/testing/brand-access.fixture';
import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BrandRelocationService } from '@api/collections/brands/services/brand-relocation.service';
import {
  hashBrandedGenerationArtifactManifestV1,
  hashBrandedGenerationTextV1,
} from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationPromptStoreService } from '@api/services/branded-generation-receipts/branded-generation-prompt-store.service';
import { BrandedGenerationReceiptAccessService } from '@api/services/branded-generation-receipts/branded-generation-receipt-access.service';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BrandedGenerationCompilerRecipeV1 } from '@api/services/branded-generation-receipts/branded-generation-recompile.types';
import { compileSnapshotBriefResolution } from '@api/services/harness/branded-generation-compiler';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  assertControllerOwnedMigrationConnection,
  assertControllerOwnedMigrationIdentity,
  assertControllerOwnedMigrationInventory,
  type ControllerOwnedMigrationRow,
  readControllerOwnedMigrationDatabaseUrl,
} from '@api-test/helpers/controller-owned-migration-database';
import { formatMigrationDeployDiagnostic } from '@api-test/helpers/migration-deploy-diagnostics';
import type {
  BrandedGenerationInputV1,
  BrandedGenerationReceiptV1,
  BrandedGenerationResolutionV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { PrismaClient } from '@genfeedai/prisma';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const baseUrl = readControllerOwnedMigrationDatabaseUrl(
  'brand-acceptance',
  process.env.BRANDED_GENERATION_TEST_DATABASE_URL,
);
const sqlSchema = 'public';
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
scoped.searchParams.set('schema', sqlSchema);
let control: Client;
let observer: Client;
const clients: PrismaClient[] = [];
const services: BrandedGenerationReceiptsService[] = [];
const relocations: BrandRelocationService[] = [];
const outstanding = new Set<Promise<unknown>>();
const barriers = new Set<number>();
const originalKey = process.env.TOKEN_ENCRYPTION_KEY;
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
function retainedRecipe(
  receipt: BrandedGenerationReceiptV1,
): BrandedGenerationCompilerRecipeV1 {
  return ['snapshot-brief-v1', [], [], [], resolution(receipt).learning, {}];
}
function retainedResolution(
  value: BrandedGenerationInputV1,
  recipe: BrandedGenerationCompilerRecipeV1,
) {
  return compileSnapshotBriefResolution(
    value,
    null,
    recipe[4],
    recipe[5],
    recipe[1],
    recipe[2],
    recipe[3],
  );
}
async function readPrivateCompiled(
  actor: BrandedGenerationActorV1,
  receipt: BrandedGenerationReceiptV1,
) {
  const store = new BrandedGenerationPromptStoreService(
    new BrandedGenerationReceiptAccessService(
      brandAccessFixture(clients[0] as unknown as PrismaService),
    ),
  );
  return clients[0].$transaction((tx) =>
    store.readCompiled(tx, actor, receipt),
  );
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
    const expectedMigrations = [];
    for (const name of migrationNames) {
      const sql = readFileSync(
        resolve(migrationDirectory, name, 'migration.sql'),
        'utf8',
      );
      if (/(?:"public"|\bpublic)\s*\./i.test(sql))
        throw new Error(
          'Fixture migration scope requires planner revalidation',
        );
      expectedMigrations.push({
        migration_name: name,
        checksum: createHash('sha256').update(sql, 'utf8').digest('hex'),
      });
    }
    control = new Client({
      connectionString: baseUrl,
      application_name: `${schema}_control`,
    });
    observer = new Client({
      connectionString: baseUrl,
      application_name: `${schema}_observer`,
      options: `-c search_path=${sqlSchema}`,
    });
    await control.connect();
    await assertControllerOwnedMigrationConnection(
      control,
      'brand-acceptance',
      true,
    );
    try {
      execFileSync('bun', ['x', 'prisma', 'migrate', 'deploy'], {
        cwd: prismaDirectory,
        env: { ...process.env, DATABASE_URL: scoped.toString() },
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
        stdio: 'pipe',
      });
    } catch (error) {
      process.stderr.write(
        `${formatMigrationDeployDiagnostic(error, scoped.toString())}\n`,
      );
      throw new Error('Fixture full migration deployment failed');
    }
    await observer.connect();
    for (const connection of [control, observer])
      await assertControllerOwnedMigrationConnection(
        connection,
        'brand-acceptance',
      );
    const applied = await control.query<ControllerOwnedMigrationRow>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
    );
    expect(applied.rows.map((row) => row.migration_name)).toEqual(
      migrationNames,
    );
    assertControllerOwnedMigrationInventory(applied.rows, expectedMigrations);
    expect(migrationNames).toContain(
      '20261001170000_branded_generation_receipts',
    );
    expect(migrationNames).toContain(
      '20261001173000_branded_generation_compiler_recipe',
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
            options: `-c search_path=${sqlSchema}`,
            application_name,
            max: 2,
          },
          { schema: sqlSchema },
        ),
      });
      clients.push(prisma);
      const current = await prisma.$queryRaw<
        Array<{ database: string; schema: string }>
      >`SELECT current_database() AS database, current_schema() AS schema`;
      assertControllerOwnedMigrationIdentity(current[0], 'brand-acceptance');
      const access = new BrandedGenerationReceiptAccessService(
        brandAccessFixture(clients[0] as unknown as PrismaService),
      );
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
    await Promise.allSettled([...barriers].map((key) => release(key)));
    await Promise.allSettled([...outstanding]);
    const closed = await Promise.allSettled([
      ...clients.map((client) => client.$disconnect()),
      observer?.end(),
      control?.end(),
    ]);
    if (originalKey === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
    else process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    const errors = closed.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : [],
    );
    if (errors.length > 0)
      throw new AggregateError(errors, 'Brand fixture disconnect failed');
  });

  it('serializes same-input create, rejects changed payloads, and isolates other scopes', async () => {
    const s = await seed();
    const value = input(s.actor);
    const results = await Promise.all(
      services.map((service) =>
        service.create(value, {
          organizationId: value.organizationId,
          brandId: value.brandId,
          actorId: value.actorId,
        }),
      ),
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
      await expect(
        services[0].create(
          { ...value, ...patch },
          {
            organizationId: { ...value, ...patch }.organizationId,
            brandId: { ...value, ...patch }.brandId,
            actorId: { ...value, ...patch }.actorId,
          },
        ),
      ).rejects.toThrow('request_payload_conflict');
    expect(await counts(s.actor)).toEqual([1, 1, 1]);
    await services[0].create(
      { ...value, brandId: s.fallback },
      {
        organizationId: { ...value, brandId: s.fallback }.organizationId,
        brandId: { ...value, brandId: s.fallback }.brandId,
        actorId: { ...value, brandId: s.fallback }.actorId,
      },
    );
    await services[0].create(
      {
        ...value,
        organizationId: s.destination,
        brandId: s.destinationBrand,
      },
      {
        organizationId: {
          ...value,
          organizationId: s.destination,
          brandId: s.destinationBrand,
        }.organizationId,
        brandId: {
          ...value,
          organizationId: s.destination,
          brandId: s.destinationBrand,
        }.brandId,
        actorId: {
          ...value,
          organizationId: s.destination,
          brandId: s.destinationBrand,
        }.actorId,
      },
    );
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
        {
          organizationId: input({ ...s.actor, actorId: s.member }, text)
            .organizationId,
          brandId: input({ ...s.actor, actorId: s.member }, text).brandId,
          actorId: input({ ...s.actor, actorId: s.member }, text).actorId,
        },
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
    const current = (
      await services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      })
    ).receipt;
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
      await expect(
        services[0].create(input(s.actor), {
          organizationId: input(s.actor).organizationId,
          brandId: input(s.actor).brandId,
          actorId: input(s.actor).actorId,
        }),
      ).rejects.toThrow('fixture_event_insert_failure');
      expect(await counts(s.actor)).toEqual([0, 0, 0]);
    } finally {
      await control.query(
        'DROP TRIGGER fixture_event_failure ON branded_generation_receipt_events; DROP FUNCTION fixture_event_failure()',
      );
    }
    const current = (
      await services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      })
    ).receipt;
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
    const current = (
      await services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      })
    ).receipt;
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
    const current = (
      await services[0].create(value, {
        organizationId: value.organizationId,
        brandId: value.brandId,
        actorId: value.actorId,
      })
    ).receipt;
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
    await expect(
      services[0].create(value, {
        organizationId: value.organizationId,
        brandId: value.brandId,
        actorId: value.actorId,
      }),
    ).rejects.toThrow('receipt_deleted');
    expect(await counts(s.actor)).toEqual([1, 3, 3]);
  }, 60000);
  it('retains a real compiled recipe once across concurrent operation owners and preserves legacy reads', async () => {
    const s = await seed();
    const value = input(
      { ...s.actor, actorId: s.member },
      '  compiled Café 😀\r\n',
    );
    const current = (
      await services[0].create(value, {
        organizationId: value.organizationId,
        brandId: value.brandId,
        actorId: value.actorId,
      })
    ).receipt;
    const recipe = retainedRecipe(current);
    const compiled = retainedResolution(value, recipe);
    const mutation = { operationKey: 'compiled-recipe', expectedRevision: 0 };
    const results = await Promise.all(
      services.map((service) =>
        service.recordCompiledResolution(
          { ...s.actor, actorId: s.member },
          current.id,
          mutation,
          compiled,
          value,
          recipe,
        ),
      ),
    );
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(results[0].receipt).toEqual(results[1].receipt);
    expect(await counts(s.actor)).toEqual([1, 2, 2]);
    const receipt = results[0].receipt;
    expect(await readPrivateCompiled(s.actor, receipt)).toMatchObject({
      status: 'retained',
      text: value.originalPrompt,
      retainedInput: value,
      compilerRecipe: recipe,
    });
    expect(
      await services[0].readPrompt(s.actor, current.id, 'compiled'),
    ).toEqual({
      status: 'retained',
      text: value.originalPrompt,
      contentHash: hashBrandedGenerationTextV1(value.originalPrompt),
    });
    const rows = await clients[0].generationPromptSnapshot.findMany({
      where: {
        organizationId: s.source,
        brandId: s.brand,
        brandedGenerationReceiptId: current.id,
        isDeleted: false,
      },
      orderBy: { brandedGenerationReceiptRevision: 'asc' },
    });
    expect(rows.map((row) => row.format)).toEqual([
      'genfeed.branded-generation-prompt.v1',
      'genfeed.branded-generation-compiled.v1',
    ]);
    expect(rows.every((row) => row.userId === s.member)).toBe(true);
    expect(rows[1].ciphertext).not.toContain(value.originalPrompt);
    const events = await clients[0].brandedGenerationReceiptEvent.findMany({
      where: {
        organizationId: s.source,
        brandId: s.brand,
        receiptId: current.id,
        isDeleted: false,
      },
    });
    for (const projection of [
      receipt,
      ...events.map((event) => event.projection),
    ]) {
      expect(projection).not.toHaveProperty('retainedInput');
      expect(projection).not.toHaveProperty('compilerRecipe');
    }
    const hiddenStages: BrandedGenerationCompilerRecipeV1[2] = [
      [
        {
          kind: 'pack',
          id: 'hidden-pack',
          version: 'v1',
          status: 'not_applicable',
          evidenceIds: [],
          omittedIds: [],
        },
        [
          {
            header: 'hidden',
            content: 'unused private bytes',
            untrusted: false,
            isAtomic: true,
          },
        ],
        [[]],
      ],
    ];
    const hidden: BrandedGenerationCompilerRecipeV1 = [
      recipe[0],
      recipe[1],
      hiddenStages,
      recipe[3],
      recipe[4],
      recipe[5],
    ];
    expect(retainedResolution(value, hidden)).toEqual(compiled);
    await expect(
      services[0].recordCompiledResolution(
        { ...s.actor, actorId: s.member },
        current.id,
        mutation,
        compiled,
        value,
        hidden,
      ),
    ).rejects.toThrow('request_payload_conflict');
    expect(await counts(s.actor)).toEqual([1, 2, 2]);
    const legacyInput = input(s.actor);
    const legacy = (
      await services[0].create(legacyInput, {
        organizationId: legacyInput.organizationId,
        brandId: legacyInput.brandId,
        actorId: legacyInput.actorId,
      })
    ).receipt;
    const legacyResolved = (
      await services[0].recordResolution(
        s.actor,
        legacy.id,
        { operationKey: 'legacy', expectedRevision: 0 },
        resolution(legacy),
      )
    ).receipt;
    expect(await readPrivateCompiled(s.actor, legacyResolved)).toEqual({
      status: 'unavailable',
      reasonCode: 'compiler_recipe_unavailable',
    });
    expect(
      await services[0].readPrompt(s.actor, legacy.id, 'compiled'),
    ).toMatchObject({ status: 'retained', text: 'compiled fixture' });
  }, 60000);
  it('applies compiled-only linkage, foreign-scope rejection and unchanged immutability after full migrations', async () => {
    const s = await seed();
    const value = input(s.actor);
    const current = (
      await services[0].create(value, {
        organizationId: value.organizationId,
        brandId: value.brandId,
        actorId: value.actorId,
      })
    ).receipt;
    const recipe = retainedRecipe(current);
    const receipt = (
      await services[0].recordCompiledResolution(
        s.actor,
        current.id,
        { operationKey: 'compiled', expectedRevision: 0 },
        retainedResolution(value, recipe),
        value,
        recipe,
      )
    ).receipt;
    const before = await counts(s.actor);
    for (const stage of ['original', 'enhanced'])
      await rollbackFailure(
        () =>
          control.query(
            `INSERT INTO generation_prompt_snapshots(id,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage") SELECT $1,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId",2,$2 FROM generation_prompt_snapshots WHERE id=$3`,
            [randomUUID(), stage, receipt.prompts.compiled?.snapshotId],
          ),
        {
          code: '23514',
          constraint: 'generation_prompt_snapshots_branded_link_check',
        },
      );
    for (const [organizationId, brandId] of [
      [s.destination, s.destinationBrand],
      [s.source, s.fallback],
    ])
      await rollbackFailure(
        () =>
          control.query(
            `INSERT INTO generation_prompt_snapshots(id,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage") SELECT $1,$2,$3,"userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId",2,'compiled' FROM generation_prompt_snapshots WHERE id=$4`,
            [
              randomUUID(),
              organizationId,
              brandId,
              receipt.prompts.compiled?.snapshotId,
            ],
          ),
        {
          code: '23503',
          constraint: 'generation_prompt_snapshots_receipt_fkey',
        },
      );
    for (const [column, changed] of [
      ['format', 'genfeed.branded-generation-prompt.v1'],
      ['ciphertext', EncryptionUtil.encrypt('changed')],
    ])
      await rollbackFailure(
        () =>
          control.query(
            `UPDATE generation_prompt_snapshots SET "${column}"=$1 WHERE id=$2`,
            [changed, receipt.prompts.compiled?.snapshotId],
          ),
        { code: 'P0001', message: 'receipt_prompt_immutable' },
      );
    for (const cipher of [
      `${'a'.repeat(32)}:a:${'b'.repeat(32)}`,
      `${'a'.repeat(32)}:${'aa'.repeat(4194305)}:${'b'.repeat(32)}`,
    ])
      await rollbackFailure(
        () =>
          control.query(
            `INSERT INTO generation_prompt_snapshots(id,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage") SELECT $1,"organizationId","brandId","userId",format,"contentHash",$2,"brandedGenerationReceiptId",2,'compiled' FROM generation_prompt_snapshots WHERE id=$3`,
            [randomUUID(), cipher, receipt.prompts.compiled?.snapshotId],
          ),
        {
          code: '23514',
          constraint: 'generation_prompt_snapshots_ciphertext_check',
        },
      );
    expect(await counts(s.actor)).toEqual(before);
    expect(await services[0].get(s.actor, current.id)).toEqual(receipt);
  }, 60000);
  it('rejects actually encrypted retained-input and recipe tampering without weakening immutable rows', async () => {
    const s = await seed();
    for (const kind of ['input', 'recipe']) {
      const value = input(s.actor);
      const current = (
        await services[0].create(value, {
          organizationId: value.organizationId,
          brandId: value.brandId,
          actorId: value.actorId,
        })
      ).receipt;
      const recipe = retainedRecipe(current);
      const receipt = (
        await services[0].recordCompiledResolution(
          s.actor,
          current.id,
          { operationKey: 'compiled', expectedRevision: 0 },
          retainedResolution(value, recipe),
          value,
          recipe,
        )
      ).receipt;
      const original =
        await clients[0].generationPromptSnapshot.findFirstOrThrow({
          where: {
            organizationId: s.source,
            brandId: s.brand,
            id: receipt.prompts.compiled?.snapshotId,
            isDeleted: false,
          },
        });
      const envelope = JSON.parse(EncryptionUtil.decrypt(original.ciphertext));
      if (kind === 'input') envelope.retainedInput.actorId = s.member;
      else
        envelope.compilerRecipe[3] = [
          { code: 'tampered', severity: 'warning', message: 'Tampered' },
        ];
      await control.query('BEGIN');
      try {
        const id = randomUUID();
        await control.query(
          `INSERT INTO generation_prompt_snapshots(id,"organizationId","brandId","userId",format,"contentHash",ciphertext,"brandedGenerationReceiptId","brandedGenerationReceiptRevision","brandedGenerationReceiptStage") SELECT $1,"organizationId","brandId","userId",format,"contentHash",$2,"brandedGenerationReceiptId",0,'compiled' FROM generation_prompt_snapshots WHERE id=$3`,
          [id, EncryptionUtil.encrypt(JSON.stringify(envelope)), original.id],
        );
        const access = new BrandedGenerationReceiptAccessService(
          brandAccessFixture(clients[0] as unknown as PrismaService),
        );
        const store = new BrandedGenerationPromptStoreService(access);
        // Commit the scoped fixture row so the real Prisma read transaction can observe it.
        await control.query('COMMIT');
        const altered = structuredClone(receipt);
        if (!altered.prompts.compiled)
          throw new Error('Missing compiled reference');
        altered.prompts.compiled.snapshotId = id;
        expect(
          await clients[0].$transaction((tx) =>
            store.readCompiled(tx, s.actor, altered),
          ),
        ).toEqual({
          status: 'unavailable',
          reasonCode: 'prompt_integrity_failed',
        });
        expect(
          await clients[0].$transaction((tx) =>
            store.read(tx, s.actor, altered, 'compiled'),
          ),
        ).toEqual({
          status: 'unavailable',
          reasonCode: 'prompt_integrity_failed',
        });
        // Remove no immutable rows: exact permitted purge is the cleanup for this inserted fixture.
        await control.query(
          `UPDATE generation_prompt_snapshots SET ciphertext='',"retentionState"='purged',"isDeleted"=true WHERE id=$1`,
          [id],
        );
      } finally {
        await control.query('ROLLBACK');
      }
      expect(await services[0].get(s.actor, current.id)).toEqual(receipt);
    }
  }, 60000);
  it('rolls compiled envelope, enhanced prompt, event and projection back on actual event failure', async () => {
    const s = await seed();
    const value = input(s.actor);
    const current = (
      await services[0].create(value, {
        organizationId: value.organizationId,
        brandId: value.brandId,
        actorId: value.actorId,
      })
    ).receipt;
    const recipe = retainedRecipe(current);
    await control.query(
      `CREATE FUNCTION fixture_compiled_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."organizationId"='${s.source}' THEN RAISE EXCEPTION 'fixture_compiled_event_failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_compiled_failure BEFORE INSERT ON branded_generation_receipt_events FOR EACH ROW EXECUTE FUNCTION fixture_compiled_failure()`,
    );
    try {
      await expect(
        services[0].recordCompiledResolution(
          s.actor,
          current.id,
          { operationKey: 'compiled-fault', expectedRevision: 0 },
          retainedResolution(value, recipe),
          value,
          recipe,
          'enhanced',
        ),
      ).rejects.toThrow('fixture_compiled_event_failure');
      expect(await counts(s.actor)).toEqual([1, 1, 1]);
      expect(await services[0].get(s.actor, current.id)).toEqual(current);
    } finally {
      await control.query(
        'DROP TRIGGER fixture_compiled_failure ON branded_generation_receipt_events; DROP FUNCTION fixture_compiled_failure()',
      );
    }
  }, 60000);
  it('purges both branded formats while preserving unrelated legacy payloads', async () => {
    const s = await seed();
    const value = input(s.actor);
    const current = (
      await services[0].create(value, {
        organizationId: value.organizationId,
        brandId: value.brandId,
        actorId: value.actorId,
      })
    ).receipt;
    const recipe = retainedRecipe(current);
    const receipt = (
      await services[0].recordCompiledResolution(
        s.actor,
        current.id,
        { operationKey: 'compiled', expectedRevision: 0 },
        retainedResolution(value, recipe),
        value,
        recipe,
        'enhanced',
      )
    ).receipt;
    const legacy = await clients[0].generationPromptSnapshot.create({
      data: {
        id: randomUUID(),
        organizationId: s.source,
        brandId: s.brand,
        userId: s.owner,
        format: 'fixture-legacy',
        contentHash: hashBrandedGenerationTextV1('unrelated'),
        ciphertext: EncryptionUtil.encrypt('unrelated'),
        retentionState: 'retained',
      },
    });
    await services[0].softDelete(s.actor, current.id, {
      operationKey: 'delete',
      expectedRevision: 1,
    });
    const rows = await clients[0].generationPromptSnapshot.findMany({
      where: {
        organizationId: s.source,
        brandId: s.brand,
        brandedGenerationReceiptId: current.id,
      },
    });
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.format))).toEqual(
      new Set([
        'genfeed.branded-generation-prompt.v1',
        'genfeed.branded-generation-compiled.v1',
      ]),
    );
    expect(
      rows.every(
        (row) =>
          row.ciphertext === '' &&
          row.retentionState === 'purged' &&
          row.isDeleted,
      ),
    ).toBe(true);
    expect(
      await clients[0].generationPromptSnapshot.findFirstOrThrow({
        where: {
          id: legacy.id,
          organizationId: s.source,
          brandId: s.brand,
          isDeleted: false,
        },
      }),
    ).toEqual(legacy);
    expect(await readPrivateCompiled(s.actor, receipt)).toEqual({
      status: 'unavailable',
      reasonCode: 'prompt_snapshot_unavailable',
    });
  }, 60000);
  it('accepts the completion chain, enforces provider uniqueness and recovers expired dispatch windows', async () => {
    const s = await seed();
    const post = await clients[0].post.create({
      data: {
        id: randomUUID(),
        userId: s.owner,
        organizationId: s.source,
        brandId: s.brand,
        description: 'Completed fixture text',
      },
    });
    const current = (
      await services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      })
    ).receipt;
    const resolved = (
      await services[0].recordResolution(
        s.actor,
        current.id,
        { operationKey: 'resolve', expectedRevision: 0 },
        resolution(current),
      )
    ).receipt;
    const providerAttemptRef = `fixture-attempt-${randomUUID()}`;
    const dispatched = (
      await services[0].recordDispatch(
        s.actor,
        current.id,
        { operationKey: 'dispatch', expectedRevision: resolved.revision },
        {
          provider: 'fixture-provider',
          model: 'fixture-model',
          providerAttemptRef,
          dispatchClaimedAt: resolved.updatedAt,
          providerAcceptedAt: resolved.updatedAt,
        },
      )
    ).receipt;
    const textHash = hashBrandedGenerationTextV1(post.description);
    const bound = (
      await services[0].bindArtifact(
        s.actor,
        current.id,
        { operationKey: 'bind', expectedRevision: dispatched.revision },
        {
          artifact: {
            kind: 'post',
            id: post.id,
            mediaKind: 'text',
            version: textHash,
            parts: [],
            contentHash: hashBrandedGenerationArtifactManifestV1({
              mediaKind: 'text',
              textHash,
              parts: [],
            }),
          },
          textHash,
          completedAt: dispatched.updatedAt,
        },
      )
    ).receipt;
    const validated = (
      await services[0].recordValidation(
        s.actor,
        current.id,
        { operationKey: 'validate', expectedRevision: bound.revision },
        'validate',
        null,
      )
    ).receipt;
    expect(validated).toMatchObject({
      state: 'ready',
      compliance: 'not_claimed',
      revision: 4,
    });
    expect(
      await clients[0].brandedGenerationReceiptEvent.count({
        where: {
          receiptId: current.id,
          organizationId: s.source,
          brandId: s.brand,
          isDeleted: false,
        },
      }),
    ).toBe(validated.revision + 1);
    const stored = await clients[0].brandedGenerationReceipt.findFirstOrThrow({
      where: {
        id: current.id,
        organizationId: s.source,
        brandId: s.brand,
        isDeleted: false,
      },
    });
    expect(stored.providerAttemptRef).toBe(
      validated.execution?.providerAttemptRef,
    );
    expect(stored.projection).toEqual(validated);
    const second = (
      await services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      })
    ).receipt;
    const secondResolved = (
      await services[0].recordResolution(
        s.actor,
        second.id,
        { operationKey: 'resolve', expectedRevision: 0 },
        resolution(second),
      )
    ).receipt;
    await expect(
      services[0].recordDispatch(
        s.actor,
        second.id,
        { operationKey: 'dispatch', expectedRevision: secondResolved.revision },
        {
          provider: 'fixture-provider',
          model: 'fixture-model',
          providerAttemptRef,
          dispatchClaimedAt: secondResolved.updatedAt,
          providerAcceptedAt: secondResolved.updatedAt,
        },
      ),
    ).rejects.toMatchObject({
      message: 'provider_attempt_ref_conflict',
      status: 409,
    });
    expect((await services[0].get(s.actor, second.id)).state).toBe('resolved');
    expect(
      await services[0].recoverExpiredDispatches(s.actor, {
        limit: 10,
        now: new Date(Date.parse(secondResolved.updatedAt) + 900001),
      }),
    ).toEqual({ blocked: [second.id], skipped: [] });
    expect(await services[0].get(s.actor, second.id)).toMatchObject({
      state: 'blocked',
      execution: null,
      diagnostics: [{ code: 'dispatch_window_expired' }],
    });
  }, 60000);
  it('requires the active relocation history guard for live and tombstoned receipts', async () => {
    const s = await seed();
    const current = (
      await services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      })
    ).receipt;
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
    const creating = outcome(
      services[0].create(input(s.actor), {
        organizationId: input(s.actor).organizationId,
        brandId: input(s.actor).brandId,
        actorId: input(s.actor).actorId,
      }),
    );
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
      // Let the blocked contender run its own deadlock check first, so a lock cycle
      // aborts the receipt writer instead of a retryable relocation attempt.
      await observer.query(
        `SELECT pg_sleep(extract(epoch FROM current_setting('deadlock_timeout')::interval) + 0.5)`,
      );
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
      creating = outcome(
        services[1].create(input(s.actor), {
          organizationId: input(s.actor).organizationId,
          brandId: input(s.actor).brandId,
          actorId: input(s.actor).actorId,
        }),
      );
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
