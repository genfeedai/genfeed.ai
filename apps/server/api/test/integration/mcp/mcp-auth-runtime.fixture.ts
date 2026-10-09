import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertControllerOwnedMigrationInventory,
  type ControllerOwnedMigrationRow,
} from '@api-test/helpers/controller-owned-migration-database';
import type {
  McpRuntimeActorLabel,
  McpRuntimeFixture,
} from '@api-test/integration/mcp/mcp-auth-runtime.interface';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { Pool } from 'pg';

export function requireMcpRuntime(
  value: unknown,
  category: string,
): asserts value {
  if (!value) throw new Error(category);
}
export function runtimeDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  requireMcpRuntime(value, 'EXPLICIT_DATABASE_REQUIRED');
  const url = new URL(value);
  requireMcpRuntime(
    url.protocol === 'postgresql:' &&
      url.hostname === '127.0.0.1' &&
      url.port === '5432' &&
      url.pathname === '/genfeed_mcp_auth_runtime_test' &&
      !url.search &&
      !url.hash,
    'OWNED_DATABASE_REQUIRED',
  );
  requireMcpRuntime(
    process.env.CI === 'true' &&
      process.env.GITHUB_ACTIONS === 'true' &&
      process.platform === 'linux' &&
      /^[0-9a-f]{32}$/.test(process.env.MCP_AUTH_RUNTIME_NONCE ?? ''),
    'OWNED_LINUX_RUNTIME_REQUIRED',
  );
  return value;
}
export function runtimePrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: runtimeDatabaseUrl() }),
    log: [],
  });
}
export async function proveMigrationInventory(): Promise<string> {
  const pool = new Pool({ connectionString: runtimeDatabaseUrl() });
  try {
    const identity = await pool.query(
      'SELECT current_database() AS database,current_schema() AS schema',
    );
    requireMcpRuntime(
      identity.rows[0]?.database === 'genfeed_mcp_auth_runtime_test' &&
        identity.rows[0]?.schema === 'public',
      'MIGRATION_IDENTITY',
    );
    const directory = resolve('packages/prisma/prisma/migrations');
    const expected = readdirSync(directory)
      .filter((name) => /^\d/.test(name))
      .sort()
      .map((name) => ({
        migration_name: name,
        checksum: createHash('sha256')
          .update(readFileSync(resolve(directory, name, 'migration.sql')))
          .digest('hex'),
      }));
    const { rows } = await pool.query<ControllerOwnedMigrationRow>(
      'SELECT migration_name,checksum,finished_at,rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
    );
    assertControllerOwnedMigrationInventory(rows, expected);
    return createHash('sha256').update(JSON.stringify(expected)).digest('hex');
  } finally {
    await pool.end();
  }
}
export async function seedMcpRuntime(
  prisma: PrismaClient,
): Promise<McpRuntimeFixture> {
  requireMcpRuntime(
    (await prisma.account.count()) === 0 &&
      (await prisma.session.count()) === 0 &&
      (await prisma.apiKey.count()) === 0,
    'AUTH_FIXTURE_NOT_FRESH',
  );
  const ordinary = await prisma.role.upsert({
    where: { key: 'user' },
    create: { key: 'user', label: 'User' },
    update: {},
  });
  const owner = await prisma.role.upsert({
    where: { key: 'owner' },
    create: { key: 'owner', label: 'Owner' },
    update: {},
  });
  const admin = await prisma.role.upsert({
    where: { key: 'admin' },
    create: { key: 'admin', label: 'Admin' },
    update: {},
  });
  const actors = Object.fromEntries(
    (['U', 'V', 'W', 'Z'] as const).map((label) => [
      label,
      {
        id: randomUUID(),
        memberId: randomUUID(),
        email: `${label.toLowerCase()}-${randomUUID()}@example.invalid`,
        password: `Fixture-${randomUUID()}-Aa9!`,
      },
    ]),
  ) as Record<McpRuntimeActorLabel, McpRuntimeFixture['actors']['U']>;
  for (const [label, actor] of Object.entries(actors)) {
    await prisma.user.create({
      data: {
        id: actor.id,
        handle: `mcp-fixture-${actor.id}`,
        name: `MCP ${label}`,
        email: actor.email,
        emailVerified: true,
      },
    });
    await prisma.account.create({
      data: {
        userId: actor.id,
        accountId: actor.id,
        providerId: 'credential',
        password: await hashPassword(actor.password),
      },
    });
  }
  const organizationId = randomUUID();
  const foreignOrganizationId = randomUUID();
  for (const [id, label] of [
    [organizationId, 'O'],
    [foreignOrganizationId, 'F'],
  ]) {
    await prisma.organization.create({
      data: {
        id,
        label: `MCP fixture ${label}`,
        slug: `mcp-${id}`,
        userId: actors.W.id,
      },
    });
    await prisma.organizationSetting.create({
      data: {
        organizationId: id,
        subscriptionTier: 'PRO',
        isNotificationsEmailEnabled: false,
      },
    });
  }
  const brands = {
    A: randomUUID(),
    B: randomUUID(),
    D: randomUUID(),
    X: randomUUID(),
    missing: randomUUID(),
  };
  for (const [label, id] of Object.entries(brands)) {
    if (label === 'missing') continue;
    await prisma.brand.create({
      data: {
        id,
        label: `sentinel-brand-${label}`,
        slug: `sentinel-slug-${label.toLowerCase()}`,
        userId: actors.W.id,
        organizationId: label === 'X' ? foreignOrganizationId : organizationId,
        isDeleted: label === 'D',
      },
    });
  }
  for (const [label, actor] of Object.entries(actors)) {
    const brand = label === 'V' ? brands.B : brands.A;
    await prisma.member.create({
      data: {
        id: actor.memberId,
        userId: actor.id,
        organizationId,
        roleId:
          label === 'W' ? owner.id : label === 'Z' ? admin.id : ordinary.id,
        roleKey: label === 'W' ? 'owner' : label === 'Z' ? 'admin' : 'user',
        currentBrandId: brand,
        brands: { connect: { id: brand } },
      },
    });
    await prisma.user.update({
      where: { id: actor.id },
      data: { lastUsedOrganizationId: organizationId },
    });
  }
  return {
    organizationId,
    foreignOrganizationId,
    brands,
    actors,
    ordinaryRoleId: ordinary.id,
  };
}
export async function mutationSnapshot(): Promise<string> {
  const pool = new Pool({ connectionString: runtimeDatabaseUrl() });
  try {
    const snapshot = [];
    for (const table of [
      'workflow_executions',
      'ingredients',
      'videos',
      'posts',
      'branded_generation_receipts',
      'credit_reservations',
      'credit_transactions',
      'credit_balances',
      'billing_revenue_events',
      'context_bases',
      'context_entries',
      'knowledge_sources',
      'knowledge_source_versions',
      'knowledge_capture_requests',
    ]) {
      const result = await pool.query(
        `SELECT count(*)::text AS count,md5(coalesce(string_agg(row_to_json(t)::text,E'\n' ORDER BY t.id),'')) AS digest FROM "${table}" t`,
      );
      snapshot.push([table, result.rows[0]]);
    }
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  } finally {
    await pool.end();
  }
}

if (process.argv[2] === '--verify-migrations') {
  try {
    process.stdout.write(`${await proveMigrationInventory()}\n`);
  } catch {
    process.stderr.write('MIGRATION_INVENTORY_FAILED\n');
    process.exitCode = 1;
  }
}
