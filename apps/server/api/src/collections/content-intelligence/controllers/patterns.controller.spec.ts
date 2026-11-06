vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _req: unknown,
    serializer: { serialize(data: unknown): unknown },
    result: { docs?: unknown[] } | unknown[],
  ) => {
    const docs = Array.isArray(result) ? result : (result.docs ?? []);
    return { data: docs.map((doc) => serializer.serialize(doc)) };
  },
  serializeSingle: (
    _req: unknown,
    serializer: { serialize(data: unknown): unknown },
    data: unknown,
  ) => ({ data: serializer.serialize(data) }),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PatternsController } from '@api/collections/content-intelligence/controllers/patterns.controller';
import type { PatternsQueryDto } from '@api/collections/content-intelligence/dto/patterns-query.dto';
import type { PatternStoreService } from '@api/collections/content-intelligence/services/pattern-store.service';
import { ContentPatternType } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

interface PatternRow {
  data: { description: string; patternType: string; platform: string };
  id: string;
  isDeleted: boolean;
  organizationId: string;
  sourceCreatorId: string;
}

type Where = Record<string, unknown>;

/** Prisma `where` over scalar columns, `AND`, and JSON `{ path, equals }`. */
function matches(row: PatternRow, where: Where): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') {
      return (value as Where[]).every((clause) => matches(row, clause));
    }
    if (key === 'data') {
      const { equals, path } = value as { equals: unknown; path: string[] };
      return row.data[path[0] as keyof PatternRow['data']] === equals;
    }
    return row[key as keyof PatternRow] === value;
  });
}

const organizationId = testId('org');
const sourceCreatorId = testId('creator');
const otherCreatorId = testId('creator', 2);
const hookId = testId('pattern');
const templateId = testId('pattern', 3);
const foreignId = testId('pattern', 4);
const missingPatternId = testId('pattern', 2);

const pattern = (overrides: Partial<PatternRow>): PatternRow => ({
  data: {
    description: 'Test pattern',
    patternType: ContentPatternType.HOOK,
    platform: 'twitter',
  },
  id: hookId,
  isDeleted: false,
  organizationId,
  sourceCreatorId,
  ...overrides,
});

const user = {
  brandId: testId('brand'),
  id: 'user_123',
  organizationId,
  userId: testId('user'),
} as unknown as User;

const request = {
  originalUrl: '/api/content-intelligence/patterns',
  query: {},
} as Request;

function setup() {
  const rows: PatternRow[] = [
    pattern({}),
    pattern({
      data: {
        description: 'A template',
        patternType: ContentPatternType.TEMPLATE,
        platform: 'linkedin',
      },
      id: templateId,
      sourceCreatorId: otherCreatorId,
    }),
    pattern({ id: foreignId, organizationId: testId('org', 2) }),
  ];
  const store = {
    findAll: async ({ where }: { where: Where }) => ({
      docs: rows.filter((row) => matches(row, where)),
    }),
    findOne: async (where: Where) =>
      rows.find((row) => !row.isDeleted && matches(row, where)) ?? null,
    findOneSelect: async (where: Where) => {
      const row = rows.find((item) => !item.isDeleted && matches(item, where));
      return row ? { id: row.id } : null;
    },
    remove: async (id: string) => {
      const row = rows.find((item) => item.id === id);
      if (row) row.isDeleted = true;
      return row ?? null;
    },
  } as unknown as PatternStoreService;
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  };
  return {
    controller: new PatternsController(
      store,
      logger as unknown as LoggerService,
    ),
    rows,
  };
}

const ids = (response: unknown) =>
  (response as { data: { id: string }[] }).data.map((item) => item.id);

describe('PatternsController', () => {
  describe('findAll', () => {
    it('lists the organization patterns only', async () => {
      const { controller } = setup();

      const result = await controller.findAll(
        request,
        user,
        {} satisfies PatternsQueryDto,
      );

      expect(ids(result)).toEqual([hookId, templateId]);
    });

    it.each([
      [ContentPatternType.HOOK, hookId],
      [ContentPatternType.TEMPLATE, templateId],
    ])('filters by patternType=%s', async (patternType, expectedId) => {
      const { controller } = setup();

      const result = await controller.findAll(request, user, {
        patternType,
      } satisfies PatternsQueryDto);

      expect(ids(result)).toEqual([expectedId]);
    });

    it('filters by canonical source creator ID', async () => {
      const { controller } = setup();

      const result = await controller.findAll(request, user, {
        sourceCreatorId: otherCreatorId,
      } satisfies PatternsQueryDto);

      expect(ids(result)).toEqual([templateId]);
    });

    it('leaves out removed patterns', async () => {
      const { controller, rows } = setup();
      rows[0].isDeleted = true;

      const result = await controller.findAll(request, user, {});

      expect(ids(result)).toEqual([templateId]);
    });
  });

  describe('findOne', () => {
    it('returns a single pattern', async () => {
      const { controller } = setup();

      const result = await controller.findOne(request, user, hookId);

      expect(result).toEqual({
        data: expect.objectContaining({
          attributes: expect.objectContaining({
            description: 'Test pattern',
            sourceCreatorId,
          }),
          id: hookId,
        }),
      });
    });

    it.each([
      ['a missing pattern', missingPatternId],
      ['another organization pattern', foreignId],
      ['an invalid entity ID', 'invalid'],
    ])('404s for %s', async (_label, id) => {
      const { controller } = setup();

      await expect(controller.findOne(request, user, id)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes the pattern', async () => {
      const { controller, rows } = setup();

      await controller.remove(request, user, hookId);

      expect(rows[0].isDeleted).toBe(true);
      await expect(controller.findOne(request, user, hookId)).rejects.toThrow(
        HttpException,
      );
    });

    it('refuses another organization pattern and leaves it in place', async () => {
      const { controller, rows } = setup();

      await expect(controller.remove(request, user, foreignId)).rejects.toThrow(
        HttpException,
      );
      expect(rows[2].isDeleted).toBe(false);
    });

    it('404s for a missing pattern', async () => {
      const { controller } = setup();

      await expect(
        controller.remove(request, user, missingPatternId),
      ).rejects.toThrow(HttpException);
    });
  });
});
