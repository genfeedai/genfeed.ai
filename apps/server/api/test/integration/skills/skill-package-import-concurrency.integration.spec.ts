import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertIsolatedDatabaseUrl } from '@api-test/../scripts/assert-isolated-db-url';
import {
  assertControllerOwnedMigrationInventory,
  type ControllerOwnedMigrationRow,
} from '@api-test/helpers/controller-owned-migration-database';
import { formatMigrationDeployDiagnostic } from '@api-test/helpers/migration-deploy-diagnostics';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// This suite has no skip/default DATABASE_URL path. Its hosted lane must provision
// a fresh, disposable database bearing exactly this dedicated name.
const databaseName = 'genfeed_skill_package_import_test';
const barrier = 7310241;
const prismaDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../packages/prisma',
);
let control: Client;
let observer: Client;
let first: PrismaClient;
let second: PrismaClient;
let firstService: SkillLibraryService;
let secondService: SkillLibraryService;
const actor = { userId: 'import-user-1', organizationId: 'import-org' };
const otherActor = { userId: 'import-user-2', organizationId: 'import-org' };

function packageInput(slug: string, name = 'Ordinary import') {
  return {
    slug,
    package: {
      format: 'files',
      files: [
        {
          path: 'SKILL.md',
          content: `---\nname: ${name}\ndescription: Disposable concurrency fixture\n---\nExact captured instructions`,
        },
      ],
    },
  };
}
async function waitBlocked(application: string, blocker?: number) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ pid: number; blockers: number[] }>(
      'SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE application_name=$1',
      [application],
    );
    const blocked = result.rows.find((row) =>
      blocker === undefined
        ? row.blockers.length > 0
        : row.blockers.includes(blocker),
    );
    if (blocked) return blocked.pid;
  }
  throw new Error(`Expected real database contention for ${application}`);
}
async function withBarrier(run: () => Promise<void>) {
  await control.query('SELECT pg_advisory_lock($1)', [barrier]);
  try {
    await run();
  } finally {
    await control.query('SELECT pg_advisory_unlock_all()');
  }
}
async function assertCaptured(slug: string, expectedUserId: string) {
  const result = await observer.query(
    `SELECT s.audience, s."ownerKind", s."ownerUserId", s."organizationId", s."brandId", s."currentVersionId", v.id AS "versionId", v."versionNumber", v."createdById", v."instructionText", v."contentHash"
    FROM skills s JOIN skill_versions v ON v."skillId"=s.id WHERE s.config->>'slug'=$1`,
    [slug],
  );
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({
    audience: 'private',
    ownerKind: 'user',
    ownerUserId: expectedUserId,
    organizationId: null,
    brandId: null,
    versionNumber: 1,
    createdById: expectedUserId,
    instructionText: 'Exact captured instructions',
  });
  expect(result.rows[0].currentVersionId).toBe(result.rows[0].versionId);
  expect(result.rows[0].contentHash).toMatch(/^sha256:skill-v1:[a-f0-9]{64}$/);
}
async function counts(slug: string) {
  const result = await observer.query<{ skills: string; versions: string }>(
    `SELECT count(DISTINCT s.id)::text AS skills, count(v.id)::text AS versions
     FROM skills s LEFT JOIN skill_versions v ON v."skillId"=s.id
     WHERE s.config->>'slug'=$1`,
    [slug],
  );
  return result.rows[0];
}

beforeAll(async () => {
  const supplied = process.env.SKILL_PACKAGE_IMPORT_TEST_DATABASE_URL;
  if (!supplied)
    throw new Error(
      'SKILL_PACKAGE_IMPORT_TEST_DATABASE_URL is required; no shared database fallback',
    );
  const url = new URL(assertIsolatedDatabaseUrl(supplied));
  if (url.pathname !== `/${databaseName}` || url.search || url.hash)
    throw new Error('Dedicated disposable import database URL required');
  control = new Client({
    connectionString: url.toString(),
    application_name: 'skill-import-control',
    statement_timeout: 10000,
    lock_timeout: 8000,
  });
  observer = new Client({
    connectionString: url.toString(),
    application_name: 'skill-import-observer',
    statement_timeout: 10000,
    lock_timeout: 8000,
  });
  await control.connect();
  const identity = await control.query(
    'SELECT current_database() AS database, current_schema() AS schema',
  );
  expect(identity.rows).toEqual([{ database: databaseName, schema: 'public' }]);
  const relations = await control.query(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')",
  );
  if (relations.rows.length)
    throw new Error(
      'Disposable import database must have a fresh public schema',
    );
  const migrationsDirectory = resolve(prismaDirectory, 'prisma/migrations');
  const expected = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({
      migration_name: name,
      checksum: createHash('sha256')
        .update(
          readFileSync(resolve(migrationsDirectory, name, 'migration.sql')),
        )
        .digest('hex'),
    }));
  try {
    execFileSync('bun', ['x', 'prisma', 'migrate', 'deploy'], {
      cwd: prismaDirectory,
      env: { ...process.env, DATABASE_URL: url.toString() },
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: 'pipe',
    });
  } catch (error) {
    process.stderr.write(
      `${formatMigrationDeployDiagnostic(error, url.toString())}\n`,
    );
    throw new Error('Full import fixture migration deployment failed');
  }
  const applied = await control.query<ControllerOwnedMigrationRow>(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
  );
  assertControllerOwnedMigrationInventory(applied.rows, expected);
  await observer.connect();
  const observedIdentity = await observer.query(
    'SELECT current_database() AS database, current_schema() AS schema',
  );
  expect(observedIdentity.rows).toEqual(identity.rows);
  function client(application_name: string) {
    return new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url.toString(),
        application_name,
        statement_timeout: 10000,
        lock_timeout: 8000,
      }),
      transactionOptions: {
        timeout: 15000,
        maxWait: 10000,
        isolationLevel: 'ReadCommitted',
      },
    });
  }
  first = client('skill-import-first');
  second = client('skill-import-second');
  await first.user.createMany({
    data: [
      { id: actor.userId, handle: actor.userId },
      { id: otherActor.userId, handle: otherActor.userId },
    ],
  });
  await first.organization.create({
    data: {
      id: actor.organizationId,
      slug: actor.organizationId,
      label: 'Import fixture',
      userId: actor.userId,
    },
  });
  await first.brand.create({
    data: {
      id: 'import-brand',
      slug: 'import-brand',
      label: 'Fixture brand',
      userId: actor.userId,
      organizationId: actor.organizationId,
    },
  });
  await first.role.create({
    data: { id: 'import-role', key: 'import-member', label: 'Fixture member' },
  });
  await first.member.createMany({
    data: [actor, otherActor].map((value) => ({
      ...value,
      roleId: 'import-role',
      roleKey: 'member',
      currentBrandId: 'import-brand',
      isActive: true,
    })),
  });
  // Fixture-only trigger holds actual INSERTs after the service user lock; the
  // observer distinguishes advisory barriers from competing row-lock waiters.
  await control.query(`CREATE FUNCTION import_fixture_barrier() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.config->>'slug' LIKE 'held-%' AND NEW.label IN ('Held first', 'Rollback first') THEN
        PERFORM pg_advisory_xact_lock(${barrier});
        IF NEW.label='Rollback first' THEN RAISE EXCEPTION 'fixture rollback'; END IF;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER zz_import_fixture_barrier BEFORE INSERT ON skills FOR EACH ROW EXECUTE FUNCTION import_fixture_barrier()`);
  firstService = new SkillLibraryService(first as unknown as PrismaService);
  secondService = new SkillLibraryService(second as unknown as PrismaService);
}, 150000);

afterAll(async () => {
  if (control)
    await control
      .query('SELECT pg_advisory_unlock_all()')
      .catch(() => undefined);
  await Promise.allSettled([
    first?.$disconnect(),
    second?.$disconnect(),
    control?.end(),
    observer?.end(),
  ]);
});

describe('validated import actual PostgreSQL capture and serialization', () => {
  it('serializes same-user same-slug commit and captures exactly one immutable version', async () => {
    await withBarrier(async () => {
      const firstResult = firstService
        .importValidatedPackage(
          actor,
          packageInput('held-commit', 'Held first'),
        )
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      const firstPid = await waitBlocked('skill-import-first');
      const secondResult = secondService
        .importValidatedPackage(actor, packageInput('HELD-COMMIT'))
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      await waitBlocked('skill-import-second', firstPid);
      await control.query('SELECT pg_advisory_unlock($1)', [barrier]);
      const [winner, loser] = await Promise.all([firstResult, secondResult]);
      expect(winner).toHaveProperty('value.currentVersionId');
      expect(loser).toHaveProperty('error.status', 409);
      expect(await counts('held-commit')).toEqual({
        skills: '1',
        versions: '1',
      });
      await assertCaptured('held-commit', actor.userId);
    });
  }, 20000);
  it('rolls back the first capture and allows the waiting import to create one version', async () => {
    await withBarrier(async () => {
      const firstResult = firstService
        .importValidatedPackage(
          actor,
          packageInput('held-rollback', 'Rollback first'),
        )
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      const firstPid = await waitBlocked('skill-import-first');
      const secondResult = secondService
        .importValidatedPackage(actor, packageInput('held-rollback'))
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      await waitBlocked('skill-import-second', firstPid);
      await control.query('SELECT pg_advisory_unlock($1)', [barrier]);
      const [rolledBack, winner] = await Promise.all([
        firstResult,
        secondResult,
      ]);
      expect(rolledBack).toHaveProperty('error');
      expect(winner).toHaveProperty('value.currentVersionId');
      expect(await counts('held-rollback')).toEqual({
        skills: '1',
        versions: '1',
      });
      await assertCaptured('held-rollback', actor.userId);
    });
  }, 20000);
  it('allows a different user to finish while the first user remains held', async () => {
    await withBarrier(async () => {
      const firstResult = firstService
        .importValidatedPackage(
          actor,
          packageInput('held-independent', 'Held first'),
        )
        .then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      await waitBlocked('skill-import-first');
      const other = await secondService.importValidatedPackage(
        otherActor,
        packageInput('held-independent'),
      );
      expect(other.currentVersionId).toBeTruthy();
      await waitBlocked('skill-import-first');
      await control.query('SELECT pg_advisory_unlock($1)', [barrier]);
      expect(await firstResult).toHaveProperty('value.currentVersionId');
      expect(await counts('held-independent')).toEqual({
        skills: '2',
        versions: '2',
      });
    });
  }, 20000);
});
