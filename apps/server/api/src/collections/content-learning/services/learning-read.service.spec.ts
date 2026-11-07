import type { LearningAccountService } from '@api/collections/content-learning/services/learning-account.service';
import { LearningReadService } from '@api/collections/content-learning/services/learning-read.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/shared/modules/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

type Row = Record<string, unknown>;

interface Tables {
  checkpoints: Row[];
  credentials: Row[];
  decisions: Row[];
  policies: Row[];
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

function tables(): Tables {
  const live = { isDeleted: false, organizationId: 'org' };
  return {
    checkpoints: [1, 2, 3].map((n) => ({
      ...live,
      credentialId: 'credential',
      id: `checkpoint-${n}`,
      receivedAt: new Date(Date.UTC(2026, 10, n)),
    })),
    credentials: [{ id: 'credential', organizationId: 'org' }],
    decisions: [{ ...live, credentialId: 'credential', id: 'decision' }],
    policies: [{ ...live, credentialId: 'credential', id: 'policy' }],
  };
}

/** Checkpoints, decisions, policy versions and the org's connected credentials. */
function buildService(data: Tables) {
  const first =
    (rows: Row[]) =>
    async ({ where }: { where: Row }) =>
      rows.find((row) => matches(row, where)) ?? null;
  const prisma = {
    contentLearningCheckpoint: {
      findMany: async ({
        skip,
        take,
        where,
      }: {
        skip: number;
        take: number;
        where: Row;
      }) =>
        data.checkpoints
          .filter((row) => matches(row, where))
          .sort(
            (a, b) =>
              (b.receivedAt as Date).getTime() -
              (a.receivedAt as Date).getTime(),
          )
          .slice(skip, skip + take),
    },
    contentLearningDecision: { findFirst: first(data.decisions) },
    contentLearningPolicyVersion: { findFirst: first(data.policies) },
  };
  const accounts = {
    credential: async (organizationId: string, credentialId: string) => {
      const credential = data.credentials.find(
        (row) =>
          row.id === credentialId && row.organizationId === organizationId,
      );
      if (!credential) throw new Error('Account not found');
      return credential;
    },
  };
  return new LearningReadService(
    prisma as unknown as PrismaService,
    accounts as unknown as LearningAccountService,
  );
}

describe('LearningReadService.evidence', () => {
  it('pages the account checkpoints newest first', async () => {
    await expect(
      buildService(tables()).evidence('org', 'credential', {
        limit: 2,
        page: 1,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'checkpoint-3' }),
      expect.objectContaining({ id: 'checkpoint-2' }),
    ]);
  });

  it('refuses an account the organization no longer has', async () => {
    await expect(
      buildService(tables()).evidence('other-org', 'credential', {
        limit: 20,
        page: 1,
      }),
    ).rejects.toThrow('Account not found');
  });
});

describe.each([
  ['decision', 'decision', 'decisions', 'Decision not found'],
  ['policy', 'policy', 'policies', 'Policy not found'],
] as const)('LearningReadService.%s', (method, id, table, notFound) => {
  it('returns the row for its own organization', async () => {
    await expect(buildService(tables())[method]('org', id)).resolves.toEqual(
      expect.objectContaining({ id }),
    );
  });

  it.each([
    ['another organization', (_data: Tables) => 'other-org'],
    [
      'a soft-deleted row',
      (data: Tables) => {
        data[table][0].isDeleted = true;
        return 'org';
      },
    ],
  ])('reports not found for %s', async (_case, change) => {
    const data = tables();
    const organizationId = change(data);

    await expect(
      buildService(data)[method](organizationId, id),
    ).rejects.toThrow(notFound);
  });

  it('refuses the row once its account is disconnected', async () => {
    const data = tables();
    data.credentials.length = 0;

    await expect(buildService(data)[method]('org', id)).rejects.toThrow(
      'Account not found',
    );
  });
});
