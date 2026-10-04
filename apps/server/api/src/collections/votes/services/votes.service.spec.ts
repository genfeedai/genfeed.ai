import { VotesService } from '@api/collections/votes/services/votes.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { VoteEntityModel } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface VoteRow {
  createdAt: number;
  entityId: string;
  entityModel: string;
  id: string;
  isDeleted: boolean;
  organizationId: string | null;
  userId: string;
}

type VoteWhere = Partial<VoteRow> & {
  OR?: Array<{ organizationId: string | null }>;
};

/**
 * In-memory `vote` delegate that enforces the partial unique index
 * `votes_entity_user_active_uidx` and yields between operations so concurrent
 * callers interleave the way separate requests do.
 */
function createFakeVoteDelegate() {
  const rows: VoteRow[] = [];
  let sequence = 0;
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

  function matches(row: VoteRow, where: VoteWhere): boolean {
    const { OR, ...fields } = where;
    const fieldsMatch = Object.entries(fields).every(
      ([key, value]) => row[key as keyof VoteRow] === value,
    );
    return (
      fieldsMatch &&
      (!OR || OR.some((arm) => row.organizationId === arm.organizationId))
    );
  }

  function violatesActiveUnique(candidate: VoteRow): boolean {
    return rows.some(
      (row) =>
        row.id !== candidate.id &&
        !row.isDeleted &&
        !candidate.isDeleted &&
        row.entityId === candidate.entityId &&
        row.userId === candidate.userId,
    );
  }

  const delegate = {
    create: vi.fn(async ({ data }: { data: Partial<VoteRow> }) => {
      await tick();
      const row: VoteRow = {
        createdAt: ++sequence,
        entityId: String(data.entityId),
        entityModel: String(data.entityModel),
        id: `vote-${sequence}`,
        isDeleted: false,
        organizationId: data.organizationId ?? null,
        userId: String(data.userId),
      };
      if (violatesActiveUnique(row)) {
        throw Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
        });
      }
      rows.push(row);
      return { ...row };
    }),
    findFirst: vi.fn(
      async ({
        orderBy,
        where,
      }: {
        orderBy?: { createdAt: 'asc' | 'desc' };
        where: VoteWhere;
      }) => {
        await tick();
        const found = rows.filter((row) => matches(row, where));
        found.sort((a, b) =>
          orderBy?.createdAt === 'desc'
            ? b.createdAt - a.createdAt
            : a.createdAt - b.createdAt,
        );
        return found[0] ? { ...found[0] } : null;
      },
    ),
    update: vi.fn(
      async ({ data, where }: { data: Partial<VoteRow>; where: VoteWhere }) => {
        await tick();
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) {
          throw new Error('Record not found');
        }
        const next = { ...row, ...data };
        if (violatesActiveUnique(next)) {
          throw Object.assign(new Error('Unique constraint failed'), {
            code: 'P2002',
          });
        }
        Object.assign(row, data);
        return { ...row };
      },
    ),
    updateMany: vi.fn(
      async ({ data, where }: { data: Partial<VoteRow>; where: VoteWhere }) => {
        await tick();
        const found = rows.filter((row) => matches(row, where));
        for (const row of found) {
          Object.assign(row, data);
        }
        return { count: found.length };
      },
    ),
  };

  return { delegate, rows };
}

describe('VotesService votes', () => {
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const input = {
    entityId: 'ingredient-1',
    entityModel: VoteEntityModel.INGREDIENT,
    organizationId: 'org-1',
    userId: 'user-1',
  };
  let fake: ReturnType<typeof createFakeVoteDelegate>;
  let service: VotesService;

  const activeVotes = () => fake.rows.filter((row) => !row.isDeleted);

  beforeEach(() => {
    vi.clearAllMocks();
    fake = createFakeVoteDelegate();
    service = new VotesService(
      { vote: fake.delegate } as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  describe('addVote', () => {
    it('writes entityId and organizationId for a first vote', async () => {
      const { created, vote } = await service.addVote(input);

      expect(created).toBe(true);
      expect(vote).toMatchObject({ id: 'vote-1' });
      expect(fake.delegate.create.mock.calls[0][0].data).toMatchObject({
        entityId: 'ingredient-1',
        entityModel: VoteEntityModel.INGREDIENT,
        organizationId: 'org-1',
        userId: 'user-1',
      });
    });

    it('leaves one vote after a double add (a retry never unvotes)', async () => {
      const first = await service.addVote(input);
      const second = await service.addVote(input);

      expect(second.created).toBe(false);
      expect(second.vote).toMatchObject({ id: first.vote.id });
      expect(activeVotes()).toHaveLength(1);
      expect(fake.delegate.create).toHaveBeenCalledTimes(1);
    });

    it('revives a soft-deleted vote instead of inserting a second row', async () => {
      const { vote } = await service.addVote(input);
      await service.removeVote(input);
      expect(activeVotes()).toHaveLength(0);

      const revived = await service.addVote(input);

      expect(revived.vote).toMatchObject({ id: vote.id, isDeleted: false });
      expect(fake.rows).toHaveLength(1);
      expect(fake.delegate.create).toHaveBeenCalledTimes(1);
    });

    it('converges concurrent adds to one active vote', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => service.addVote(input)),
      );

      expect(activeVotes()).toHaveLength(1);
      expect(new Set(results.map((result) => result.vote.id)).size).toBe(1);
    });

    it('converges concurrent revives of a soft-deleted vote to one active vote', async () => {
      await service.addVote(input);
      await service.removeVote(input);

      await Promise.all(
        Array.from({ length: 6 }, () => service.addVote(input)),
      );

      expect(activeVotes()).toHaveLength(1);
    });

    it('keeps votes of different users on the same entity separate', async () => {
      await service.addVote(input);
      await service.addVote({ ...input, userId: 'user-2' });

      expect(activeVotes()).toHaveLength(2);
    });

    it('rethrows errors that are not unique-constraint violations', async () => {
      fake.delegate.create.mockRejectedValueOnce(new Error('db down'));

      await expect(service.addVote(input)).rejects.toThrow('db down');
    });
  });

  describe('removeVote', () => {
    it('soft deletes the caller vote and is idempotent', async () => {
      await service.addVote(input);

      expect(await service.removeVote(input)).toEqual({ removedCount: 1 });
      expect(await service.removeVote(input)).toEqual({ removedCount: 0 });
      expect(fake.rows).toHaveLength(1);
      expect(fake.rows[0].isDeleted).toBe(true);
    });

    it('scopes the removal to the user and the organization', async () => {
      await service.addVote(input);
      await service.addVote({ ...input, userId: 'user-2' });

      await service.removeVote(input);

      expect(fake.delegate.updateMany.mock.calls[0][0].where).toMatchObject({
        entityId: 'ingredient-1',
        isDeleted: false,
        OR: [{ organizationId: 'org-1' }, { organizationId: null }],
        userId: 'user-1',
      });
      expect(activeVotes().map((row) => row.userId)).toEqual(['user-2']);
    });
  });
});
