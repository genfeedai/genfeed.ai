import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { vi } from 'vitest';

export interface StoredHarnessProfile {
  brandId: string;
  content: Record<string, unknown>;
  createdAt: Date;
  createdById: string | null;
  currentVersion: number;
  description: string | null;
  id: string;
  isDefault: boolean;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  scope: string;
  status: string;
  updatedAt: Date;
}

export interface StoredHarnessProfileRevision {
  actorLabel: string | null;
  actorUserId: string | null;
  brandId: string;
  createdAt: Date;
  harnessProfileId: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  rolledBackToVersion: number | null;
  snapshot: Record<string, unknown>;
  source: string;
  version: number;
}

type Where = Record<string, unknown>;

function matches(row: object, where: Where | undefined): boolean {
  return Object.entries(where ?? {}).every(
    ([key, expected]) => (row as Where)[key] === expected,
  );
}

/**
 * A tiny in-memory `harness_profiles` / `harness_profile_revisions` pair, with
 * the revision table append-only like the real one, so specs read back what
 * the service stored instead of asserting on calls.
 */
export function createHarnessProfileStore(
  brandOrganizations: Record<string, string> = {},
) {
  const profiles: StoredHarnessProfile[] = [];
  const revisions: StoredHarnessProfileRevision[] = [];

  const harnessProfile = {
    create: vi.fn(async ({ data }: { data: Partial<StoredHarnessProfile> }) => {
      const row = {
        createdAt: new Date(),
        createdById: null,
        description: null,
        id: `profile-${profiles.length + 1}`,
        isDefault: false,
        isDeleted: false,
        scope: 'brand',
        status: 'active',
        updatedAt: new Date(),
        ...data,
      } as StoredHarnessProfile;
      profiles.push(row);
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: { where?: Where }) =>
        profiles.find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where?: Where }) =>
      profiles
        .filter((row) => matches(row, where))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    ),
    updateManyAndReturn: vi.fn(
      async ({
        data,
        where,
      }: {
        data: Partial<StoredHarnessProfile> & {
          currentVersion?: { increment: number };
        };
        where?: Where;
      }) => {
        const touched = profiles.filter((row) => matches(row, where));
        for (const row of touched) {
          const { currentVersion, ...rest } = data;
          Object.assign(row, rest, {
            currentVersion:
              row.currentVersion + (currentVersion?.increment ?? 0),
            updatedAt: new Date(),
          });
        }
        return touched.map((row) => ({ ...row }));
      },
    ),
  };

  const harnessProfileRevision = {
    create: vi.fn(
      async ({ data }: { data: Partial<StoredHarnessProfileRevision> }) => {
        if (
          revisions.some(
            (row) =>
              row.harnessProfileId === data.harnessProfileId &&
              row.version === data.version,
          )
        ) {
          throw new Error('duplicate revision version');
        }
        const row = {
          actorLabel: null,
          actorUserId: null,
          createdAt: new Date(),
          id: `revision-${revisions.length + 1}`,
          isDeleted: false,
          rolledBackToVersion: null,
          ...data,
        } as StoredHarnessProfileRevision;
        row.actorLabel ??= null;
        row.actorUserId ??= null;
        row.rolledBackToVersion ??= null;
        revisions.push(structuredClone(row));
        return row;
      },
    ),
    findFirst: vi.fn(
      async ({ where }: { where?: Where }) =>
        revisions.find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where?: Where }) =>
      revisions
        .filter((row) => matches(row, where))
        .sort((a, b) => b.version - a.version),
    ),
  };

  const prisma = {
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(prisma),
    ),
    brand: {
      findFirst: vi.fn(async ({ where }: { where: Where }) =>
        brandOrganizations[where.id as string] === where.organizationId &&
        where.isDeleted === false
          ? { id: where.id }
          : null,
      ),
    },
    harnessProfile,
    harnessProfileRevision,
  };

  return {
    prisma: prisma as unknown as PrismaService,
    profiles,
    revisions,
  };
}
