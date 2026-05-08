/**
 * Clerk organization/member sync backfill.
 *
 * Usage:
 *   bun run scripts/migrations/clerk-org-member-sync-backfill.ts
 *   bun run scripts/migrations/clerk-org-member-sync-backfill.ts --env=production
 *   bun run scripts/migrations/clerk-org-member-sync-backfill.ts --env=production --live
 *   bun run scripts/migrations/clerk-org-member-sync-backfill.ts --env=production --live --create-missing-members
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../../packages/prisma/src/index';

type DbRow = Record<string, unknown>;
type ClerkRecord = Record<string, unknown>;

interface LocalOrganization {
  id: string;
  clerkOrganizationId: string | null;
  label: string;
  slug: string;
  userId: string;
}

interface LocalUser {
  id: string;
  clerkId: string | null;
  email: string | null;
}

interface LocalMember {
  id: string;
  clerkMembershipId: string | null;
  organizationId: string;
  userId: string;
}

interface LocalRole {
  id: string;
  key: string;
}

interface BackfillSummary {
  clerkOrganizations: number;
  clerkMemberships: number;
  organizationsMatched: number;
  organizationsUpdated: number;
  organizationsUnresolved: number;
  membershipsMatched: number;
  membershipsUpdated: number;
  membershipsCreated: number;
  membershipsUnresolved: number;
  staleMemberships: number;
}

const args = new Set(process.argv.slice(2));
const argValue = (name: string): string | undefined => {
  const prefix = `${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

const env = argValue('--env') ?? 'local';
const isLive = args.has('--live');
const shouldCreateMissingMembers = args.has('--create-missing-members');
const shouldDeactivateStale = args.has('--deactivate-stale');
const shouldApplySchema = isLive && !args.has('--skip-schema');

for (const envPath of [
  resolve(__dirname, `../../.env.${env}`),
  resolve(__dirname, `../../apps/server/api/.env.${env}`),
]) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

const databaseUrl = argValue('--database-url') ?? process.env.DATABASE_URL;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!databaseUrl) {
  throw new Error(`DATABASE_URL is required for --env=${env}`);
}

if (!clerkSecretKey) {
  throw new Error(`CLERK_SECRET_KEY is required for --env=${env}`);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const clerk = createClerkClient({ secretKey: clerkSecretKey });

function readString(record: ClerkRecord | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return '';
}

function readRecord(
  record: ClerkRecord | null | undefined,
  keys: string[],
): ClerkRecord | null {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as ClerkRecord;
    }
  }

  return null;
}

function rows<T extends DbRow>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeRoleKey(role: string): string[] {
  const normalized = role.replace(/^org:/, '').toLowerCase();
  if (normalized.includes('admin')) {
    return ['admin', 'owner', 'member', 'user'];
  }

  return ['member', 'user', 'admin'];
}

function metadataId(record: ClerkRecord, keys: string[]) {
  const publicMetadata = readRecord(record, [
    'publicMetadata',
    'public_metadata',
  ]);

  return readString(publicMetadata, keys);
}

function clerkOrgSlug(record: ClerkRecord) {
  return readString(record, ['slug']);
}

function clerkOrgName(record: ClerkRecord) {
  return readString(record, ['name']);
}

function getMembershipId(record: ClerkRecord) {
  return readString(record, ['id']);
}

function getMembershipRole(record: ClerkRecord) {
  return readString(record, ['role']) || 'org:member';
}

function getMembershipOrgId(record: ClerkRecord) {
  const organization = readRecord(record, ['organization']);
  return (
    readString(organization, ['id']) ||
    readString(record, ['organizationId', 'organization_id'])
  );
}

function getMembershipUserId(record: ClerkRecord) {
  const publicUserData = readRecord(record, [
    'publicUserData',
    'public_user_data',
  ]);

  return (
    readString(publicUserData, ['userId', 'user_id', 'id']) ||
    readString(record, ['userId', 'user_id'])
  );
}

async function listClerkPages(
  list: (params: { limit: number; offset: number }) => Promise<unknown>,
): Promise<ClerkRecord[]> {
  const collected: ClerkRecord[] = [];
  const limit = 100;

  for (let offset = 0; ; offset += limit) {
    const page = (await list({ limit, offset })) as ClerkRecord;
    const data = Array.isArray(page.data)
      ? (page.data as ClerkRecord[])
      : Array.isArray(page)
        ? (page as ClerkRecord[])
        : [];

    collected.push(...data);

    const totalCount =
      typeof page.totalCount === 'number'
        ? page.totalCount
        : typeof page.total_count === 'number'
          ? page.total_count
          : undefined;

    if (
      data.length < limit ||
      (totalCount !== undefined && collected.length >= totalCount)
    ) {
      break;
    }
  }

  return collected;
}

async function listClerkOrganizations(): Promise<ClerkRecord[]> {
  const organizations = clerk.organizations as unknown as {
    getOrganizationList: (params: {
      limit: number;
      offset: number;
    }) => Promise<unknown>;
  };

  return listClerkPages((params) => organizations.getOrganizationList(params));
}

async function listClerkMemberships(
  organizationId: string,
): Promise<ClerkRecord[]> {
  const organizations = clerk.organizations as unknown as {
    getOrganizationMembershipList: (params: {
      organizationId: string;
      limit: number;
      offset: number;
    }) => Promise<unknown>;
  };

  return listClerkPages((params) =>
    organizations.getOrganizationMembershipList({
      organizationId,
      ...params,
    }),
  );
}

async function applySchema(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "clerkOrganizationId" TEXT',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "clerkMembershipId" TEXT',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "organizations_clerkOrganizationId_key" ON "organizations"("clerkOrganizationId")',
  );
  await prisma.$executeRawUnsafe(
    'CREATE UNIQUE INDEX IF NOT EXISTS "members_clerkMembershipId_key" ON "members"("clerkMembershipId")',
  );
}

async function assertSchema(): Promise<void> {
  const result = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN ('organizations', 'members')
       AND column_name IN ('clerkOrganizationId', 'clerkMembershipId')`,
  );
  const columns = rows(result).map(
    (row) => `${String(row.table_name)}.${String(row.column_name)}`,
  );

  for (const required of [
    'organizations.clerkOrganizationId',
    'members.clerkMembershipId',
  ]) {
    if (!columns.includes(required)) {
      throw new Error(
        `${required} is missing. Run with --live to apply the idempotent schema patch, or run prisma migrate deploy first.`,
      );
    }
  }
}

async function loadLocalData() {
  const [organizations, users, members, roles] = await Promise.all([
    prisma.$queryRawUnsafe(
      'SELECT id, "clerkOrganizationId", label, slug, "userId" FROM "organizations" WHERE "isDeleted" = false',
    ),
    prisma.$queryRawUnsafe(
      'SELECT id, "clerkId", email FROM "users" WHERE "isDeleted" = false',
    ),
    prisma.$queryRawUnsafe(
      'SELECT id, "clerkMembershipId", "organizationId", "userId" FROM "members"',
    ),
    prisma.$queryRawUnsafe(
      'SELECT id, key FROM "roles" WHERE "isDeleted" = false',
    ),
  ]);

  return {
    members: rows<DbRow>(members).map((row) => ({
      clerkMembershipId: toStringOrNull(row.clerkMembershipId),
      id: String(row.id),
      organizationId: String(row.organizationId),
      userId: String(row.userId),
    })) satisfies LocalMember[],
    organizations: rows<DbRow>(organizations).map((row) => ({
      clerkOrganizationId: toStringOrNull(row.clerkOrganizationId),
      id: String(row.id),
      label: String(row.label),
      slug: String(row.slug),
      userId: String(row.userId),
    })) satisfies LocalOrganization[],
    roles: rows<DbRow>(roles).map((row) => ({
      id: String(row.id),
      key: String(row.key),
    })) satisfies LocalRole[],
    users: rows<DbRow>(users).map((row) => ({
      clerkId: toStringOrNull(row.clerkId),
      email: toStringOrNull(row.email),
      id: String(row.id),
    })) satisfies LocalUser[],
  };
}

function resolveOrganization(
  clerkOrganization: ClerkRecord,
  organizations: LocalOrganization[],
): LocalOrganization | null {
  const clerkOrganizationId = readString(clerkOrganization, ['id']);
  const metadataOrganizationId = metadataId(clerkOrganization, [
    'organizationId',
    'organization',
    'genfeedOrganizationId',
  ]);
  const slug = clerkOrgSlug(clerkOrganization);
  const name = clerkOrgName(clerkOrganization);

  return (
    organizations.find(
      (organization) =>
        organization.clerkOrganizationId === clerkOrganizationId,
    ) ??
    organizations.find(
      (organization) => organization.id === metadataOrganizationId,
    ) ??
    organizations.find((organization) => slug && organization.slug === slug) ??
    organizations.find(
      (organization) =>
        name &&
        organization.label.trim().toLowerCase() === name.trim().toLowerCase(),
    ) ??
    null
  );
}

function resolveRoleId(role: string, roles: LocalRole[]): string {
  for (const key of normalizeRoleKey(role)) {
    const localRole = roles.find((candidate) => candidate.key === key);
    if (localRole) {
      return localRole.id;
    }
  }

  throw new Error(`No local role found for Clerk role ${role}`);
}

async function recordActivity(params: {
  action: string;
  clerkMembershipId?: string;
  clerkOrganizationId?: string;
  organizationId?: string;
  role?: string;
  userId?: string;
}) {
  if (!isLive || !params.organizationId) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "activities" (id, "userId", "organizationId", action, data, "isDeleted", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, false, NOW(), NOW())`,
    randomUUID(),
    params.userId ?? null,
    params.organizationId,
    params.action,
    JSON.stringify({
      clerkMembershipId: params.clerkMembershipId,
      clerkOrganizationId: params.clerkOrganizationId,
      role: params.role,
      source: 'clerk-backfill',
    }),
  );
}

async function main() {
  const summary: BackfillSummary = {
    clerkMemberships: 0,
    clerkOrganizations: 0,
    membershipsCreated: 0,
    membershipsMatched: 0,
    membershipsUnresolved: 0,
    membershipsUpdated: 0,
    organizationsMatched: 0,
    organizationsUnresolved: 0,
    organizationsUpdated: 0,
    staleMemberships: 0,
  };

  console.log(
    `[${isLive ? 'LIVE' : 'DRY RUN'}] Clerk org/member backfill for env=${env}`,
  );

  if (shouldApplySchema) {
    await applySchema();
    console.log('Applied idempotent sync schema patch.');
  }
  await assertSchema();

  const local = await loadLocalData();
  const clerkOrganizations = await listClerkOrganizations();
  const seenClerkMembershipIds = new Set<string>();

  summary.clerkOrganizations = clerkOrganizations.length;

  const orgByClerkId = new Map<string, LocalOrganization>();
  for (const clerkOrganization of clerkOrganizations) {
    const clerkOrganizationId = readString(clerkOrganization, ['id']);
    const localOrganization = resolveOrganization(
      clerkOrganization,
      local.organizations,
    );

    if (!localOrganization) {
      summary.organizationsUnresolved += 1;
      console.warn(
        `Unresolved organization: clerk=${clerkOrganizationId} slug=${clerkOrgSlug(clerkOrganization)} name=${clerkOrgName(clerkOrganization)}`,
      );
      continue;
    }

    summary.organizationsMatched += 1;
    orgByClerkId.set(clerkOrganizationId, localOrganization);

    if (localOrganization.clerkOrganizationId !== clerkOrganizationId) {
      summary.organizationsUpdated += 1;
      console.log(
        `${isLive ? 'Updating' : 'Would update'} organization ${localOrganization.id} -> ${clerkOrganizationId}`,
      );

      if (isLive) {
        await prisma.$executeRawUnsafe(
          'UPDATE "organizations" SET "clerkOrganizationId" = $1, "updatedAt" = NOW() WHERE id = $2',
          clerkOrganizationId,
          localOrganization.id,
        );
        await recordActivity({
          action: 'clerk.organization.backfilled',
          clerkOrganizationId,
          organizationId: localOrganization.id,
          userId: localOrganization.userId,
        });
      }
    }

    const clerkMemberships = await listClerkMemberships(clerkOrganizationId);
    summary.clerkMemberships += clerkMemberships.length;

    for (const clerkMembership of clerkMemberships) {
      const clerkMembershipId = getMembershipId(clerkMembership);
      const clerkUserId = getMembershipUserId(clerkMembership);
      const role = getMembershipRole(clerkMembership);
      const membershipClerkOrgId =
        getMembershipOrgId(clerkMembership) || clerkOrganizationId;

      if (clerkMembershipId) {
        seenClerkMembershipIds.add(clerkMembershipId);
      }

      const organization =
        orgByClerkId.get(membershipClerkOrgId) ?? localOrganization;
      const user = local.users.find(
        (candidate) => candidate.clerkId === clerkUserId,
      );

      if (!organization || !user || !clerkMembershipId) {
        summary.membershipsUnresolved += 1;
        console.warn(
          `Unresolved membership: membership=${clerkMembershipId} clerkUser=${clerkUserId} clerkOrg=${membershipClerkOrgId}`,
        );
        continue;
      }

      const localMember =
        local.members.find(
          (member) => member.clerkMembershipId === clerkMembershipId,
        ) ??
        local.members.find(
          (member) =>
            member.organizationId === organization.id &&
            member.userId === user.id,
        ) ??
        null;

      if (!localMember) {
        if (!shouldCreateMissingMembers) {
          summary.membershipsUnresolved += 1;
          console.warn(
            `Missing local member: membership=${clerkMembershipId} user=${user.id} organization=${organization.id}. Pass --create-missing-members to insert it.`,
          );
          continue;
        }

        summary.membershipsCreated += 1;
        console.log(
          `${isLive ? 'Creating' : 'Would create'} member for user=${user.id} organization=${organization.id} clerkMembership=${clerkMembershipId}`,
        );

        if (isLive) {
          const roleId = resolveRoleId(role, local.roles);
          await prisma.$executeRawUnsafe(
            `INSERT INTO "members" (id, "clerkMembershipId", "organizationId", "userId", "roleId", "isActive", "isDeleted", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, true, false, NOW(), NOW())`,
            randomUUID(),
            clerkMembershipId,
            organization.id,
            user.id,
            roleId,
          );
          await recordActivity({
            action: 'clerk.organizationMembership.backfilled',
            clerkMembershipId,
            clerkOrganizationId,
            organizationId: organization.id,
            role,
            userId: user.id,
          });
        }
        continue;
      }

      summary.membershipsMatched += 1;

      if (localMember.clerkMembershipId !== clerkMembershipId) {
        summary.membershipsUpdated += 1;
        console.log(
          `${isLive ? 'Updating' : 'Would update'} member ${localMember.id} -> ${clerkMembershipId}`,
        );

        if (isLive) {
          await prisma.$executeRawUnsafe(
            'UPDATE "members" SET "clerkMembershipId" = $1, "isActive" = true, "isDeleted" = false, "updatedAt" = NOW() WHERE id = $2',
            clerkMembershipId,
            localMember.id,
          );
          await recordActivity({
            action: 'clerk.organizationMembership.backfilled',
            clerkMembershipId,
            clerkOrganizationId,
            organizationId: organization.id,
            role,
            userId: user.id,
          });
        }
      }
    }
  }

  const staleMembers = local.members.filter(
    (member) =>
      member.clerkMembershipId &&
      !seenClerkMembershipIds.has(member.clerkMembershipId),
  );
  summary.staleMemberships = staleMembers.length;

  if (staleMembers.length > 0) {
    console.warn(
      `Found ${staleMembers.length} local Clerk-linked members not present in Clerk anymore.`,
    );
  }

  if (isLive && shouldDeactivateStale && staleMembers.length > 0) {
    for (const member of staleMembers) {
      await prisma.$executeRawUnsafe(
        'UPDATE "members" SET "isActive" = false, "isDeleted" = true, "updatedAt" = NOW() WHERE id = $1',
        member.id,
      );
    }
    console.log(`Soft-deleted ${staleMembers.length} stale memberships.`);
  }

  console.table(summary);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
