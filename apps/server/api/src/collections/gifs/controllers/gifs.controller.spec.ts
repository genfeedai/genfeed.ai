vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeCollection: (_req: unknown, _serializer: unknown, data: unknown) =>
      data,
    serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) =>
      data,
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import type { GifsQueryDto } from '@api/collections/gifs/dto/gifs-query.dto';
import type { GifsService } from '@api/collections/gifs/services/gifs.service';
import type { VotesService } from '@api/collections/votes/services/votes.service';
import { AssetScope } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

const organizationId = 'cmorganization000000000000001';
const otherOrganizationId = 'cmorganization000000000000002';
const userId = 'cmuser0000000000000000001';
const user = {
  brandId: 'cmbrand000000000000000001',
  id: 'authProvider_user_1',
  organizationId,
  userId,
} as unknown as User;
const request = {} as Request;

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** Prisma `where` over scalars, `null`, `AND`, `OR`, `{ in }` and `{ not }`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((clause) => matches(row, clause));
    }
    if (key === 'OR') {
      return (value as Where[]).some((clause) => matches(row, clause));
    }
    const column = row[key] ?? null;
    if (value !== null && typeof value === 'object') {
      if ('in' in value) return (value.in as unknown[]).includes(column);
      if ('not' in value) return column !== value.not;
    }
    return column === value;
  });
}

const gif = (id: string, overrides: Row = {}): Row => ({
  brandId: 'cmbrand000000000000000001',
  category: 'GIF',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  id,
  isDefault: false,
  isDeleted: false,
  organizationId,
  scope: AssetScope.USER,
  status: 'completed',
  ...overrides,
});

/**
 * In-memory ingredients and votes tables behind the gif and vote services.
 * List pages are recorded with the pagination options they were read with.
 */
function setup(rows: Row[], votes: Row[] = []) {
  const pages: { limit: number; pagination: boolean }[] = [];
  const findOne = async (where: Where) => {
    const row = rows.find((item) => matches(item, where));
    return row ? { ...row } : null;
  };
  const gifs = {
    findAll: async (
      { orderBy, where }: { orderBy: Record<string, number>; where: Where },
      options: { limit: number; pagination: boolean },
    ) => {
      pages.push({ limit: options.limit, pagination: options.pagination });
      const [field, direction] = Object.entries(orderBy)[0];
      const docs = rows
        .filter((row) => matches(row, where))
        .sort(
          (a, b) =>
            direction *
            ((a[field] as Date).getTime() - (b[field] as Date).getTime()),
        )
        .map((row) => row.id);
      return { docs, totalDocs: docs.length };
    },
    findOne,
    remove: async (id: string) => {
      const row = rows.find((item) => item.id === id);
      if (row) row.isDeleted = true;
      return row ? { ...row } : null;
    },
  };
  const votesService = {
    findOneSelect: async (where: Where) =>
      votes.find((vote) => matches(vote, where)) ?? null,
  };
  const silent = () => undefined;
  const controller = new GifsController(
    gifs as unknown as GifsService,
    {
      debug: silent,
      error: silent,
      log: silent,
      warn: silent,
    } as unknown as LoggerService,
    votesService as unknown as VotesService,
  );
  return { controller, pages, rows };
}

const query = (overrides: Partial<GifsQueryDto> = {}) =>
  overrides as GifsQueryDto;

describe('GifsController', () => {
  describe('findAll', () => {
    it("lists the organization's live gifs and the platform defaults, newest first", async () => {
      const { controller } = setup([
        gif('own-old', { createdAt: new Date('2026-10-01T00:00:00Z') }),
        gif('own-new', { createdAt: new Date('2026-11-02T00:00:00Z') }),
        gif('platform-default', {
          brandId: null,
          isDefault: true,
          organizationId: null,
        }),
        gif('own-default', { isDefault: true }),
        gif('own-draft', { status: 'draft' }),
        gif('other-org', { organizationId: otherOrganizationId }),
        gif('other-org-default', {
          isDefault: true,
          organizationId: otherOrganizationId,
        }),
        gif('own-deleted', { isDeleted: true }),
        gif('own-failed', { status: 'failed' }),
        gif('own-image', { category: 'IMAGE' }),
      ]);

      const result = await controller.findAll(request, user, query());

      expect(result).toEqual({
        docs: [
          'own-new',
          'platform-default',
          'own-default',
          'own-draft',
          'own-old',
        ],
        totalDocs: 5,
      });
    });

    it('reads a collapsed "latest" query as one paginated page', async () => {
      const { controller, pages } = setup([
        gif('old', { createdAt: new Date('2026-10-01T00:00:00Z') }),
        gif('new', { createdAt: new Date('2026-11-02T00:00:00Z') }),
      ]);

      const result = await controller.findAll(
        request,
        user,
        query({ limit: 10, sort: 'createdAt: -1' }),
      );

      expect(result).toMatchObject({ docs: ['new', 'old'] });
      expect(pages).toEqual([{ limit: 10, pagination: true }]);
    });

    it('narrows to one scope when asked', async () => {
      const { controller } = setup([
        gif('private'),
        gif('public', { scope: AssetScope.PUBLIC }),
      ]);

      const result = await controller.findAll(
        request,
        user,
        query({ scope: AssetScope.PUBLIC }),
      );

      expect(result).toMatchObject({ docs: ['public'] });
    });
  });

  describe('findOne', () => {
    it.each([
      ['own', gif('cmgif000000000000000000001')],
      [
        'platform default',
        gif('cmgif000000000000000000001', {
          isDefault: true,
          organizationId: null,
        }),
      ],
    ])('returns an %s gif', async (_name, row) => {
      const { controller } = setup([row]);

      const result = await controller.findOne(
        request,
        'cmgif000000000000000000001',
        user,
      );

      expect(result).toMatchObject({
        hasVoted: false,
        id: 'cmgif000000000000000000001',
      });
    });

    it.each([
      ['missing', []],
      [
        'in another organization',
        [
          gif('cmgif000000000000000000001', {
            organizationId: otherOrganizationId,
          }),
        ],
      ],
      [
        'another category',
        [gif('cmgif000000000000000000001', { category: 'IMAGE' })],
      ],
    ])('answers 404 for a gif that is %s', async (_name, rows) => {
      const { controller } = setup(rows);

      const failure = await controller
        .findOne(request, 'cmgif000000000000000000001', user)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(HttpException);
      expect((failure as HttpException).getStatus()).toBe(404);
    });

    it.each([
      ['the caller voted', { organizationId, userId }, true],
      [
        'only another user voted',
        { organizationId, userId: 'cmuser0000000000000000002' },
        false,
      ],
      [
        'the vote was withdrawn',
        { isDeleted: true, organizationId, userId },
        false,
      ],
      [
        'the vote is from another organization',
        { organizationId: otherOrganizationId, userId },
        false,
      ],
    ])('reports hasVoted when %s', async (_name, vote, hasVoted) => {
      const { controller } = setup(
        [gif('cmgif000000000000000000001')],
        [
          {
            entityId: 'cmgif000000000000000000001',
            entityModel: 'Ingredient',
            id: 'vote-1',
            isDeleted: false,
            ...vote,
          },
        ],
      );

      const result = await controller.findOne(
        request,
        'cmgif000000000000000000001',
        user,
      );

      expect(result).toHaveProperty('hasVoted', hasVoted);
    });
  });

  describe('remove', () => {
    it('soft-deletes an own gif and returns it', async () => {
      const { controller, rows } = setup([gif('cmgif000000000000000000001')]);

      const result = await controller.remove(
        request,
        'cmgif000000000000000000001',
        user,
      );

      expect(result).toMatchObject({
        id: 'cmgif000000000000000000001',
        isDeleted: true,
      });
      expect(rows[0].isDeleted).toBe(true);
    });

    it.each([
      [
        'a platform default',
        gif('cmgif000000000000000000001', {
          isDefault: true,
          organizationId: null,
        }),
      ],
      [
        'another organization gif',
        gif('cmgif000000000000000000001', {
          organizationId: otherOrganizationId,
        }),
      ],
      [
        'an already deleted gif',
        gif('cmgif000000000000000000001', { isDeleted: true, status: 'x' }),
      ],
    ])('refuses to remove %s', async (_name, row) => {
      const { controller, rows } = setup([row]);
      const before = { ...row };

      await expect(
        controller.remove(request, 'cmgif000000000000000000001', user),
      ).rejects.toThrow(HttpException);
      expect(rows[0]).toEqual(before);
    });
  });
});
