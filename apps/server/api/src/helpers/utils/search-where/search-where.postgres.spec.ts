import { randomUUID } from 'node:crypto';
import { buildSearchWhere } from '@api/helpers/utils/search-where/search-where.util';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * The admin list search against real Prisma and PostgreSQL (#8846). Prisma
 * hands a `contains` / `string_contains` term to `ILIKE` without escaping it,
 * so `%` and `_` used to match every row. Each filter shape (a column, a key in
 * a JSON column, a column of a to-one relation) must match the term literally.
 */
describe.skipIf(!connectionString)(
  'buildSearchWhere PostgreSQL wildcard matching (#8846)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const suffix = randomUUID();
    const userId = `search-where-user-${suffix}`;
    const names = [
      '100% cotton',
      '100 cotton',
      'a_b',
      'axb',
      'back\\slash',
      'backslash',
    ];

    beforeAll(async () => {
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.createMany({
        data: names.map((label, index) => ({
          id: `search-where-org-${index}-${suffix}`,
          label,
          slug: `search-where-org-${index}-${suffix}`,
          userId,
        })),
      });
      await db.editorProject.createMany({
        data: names.map((name, index) => ({
          config: { name },
          id: `search-where-project-${index}-${suffix}`,
          organizationId: `search-where-org-${index}-${suffix}`,
          userId,
        })),
      });
      await db.fontFamilyRecord.createMany({
        data: names.map((label, index) => ({
          id: `search-where-font-${index}-${suffix}`,
          label,
        })),
      });
    });

    afterAll(async () => {
      if (!prisma) {
        return;
      }
      await prisma.editorProject.deleteMany({ where: { userId } });
      await prisma.organization.deleteMany({ where: { userId } });
      await prisma.fontFamilyRecord.deleteMany({
        where: { id: { endsWith: suffix } },
      });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    async function columnMatches(search: string): Promise<string[]> {
      const rows = await database().fontFamilyRecord.findMany({
        orderBy: { id: 'asc' },
        select: { label: true },
        where: {
          id: { endsWith: suffix },
          ...buildSearchWhere(search, { columns: ['label'] }),
        },
      });
      return rows.map((row) => row.label ?? '');
    }

    async function jsonMatches(search: string): Promise<string[]> {
      const rows = await database().editorProject.findMany({
        orderBy: { id: 'asc' },
        select: { config: true },
        where: {
          userId,
          ...buildSearchWhere(search, { json: { config: ['name'] } }),
        },
      });
      return rows.map((row) => String((row.config as { name: string }).name));
    }

    async function relationMatches(search: string): Promise<string[]> {
      const rows = await database().editorProject.findMany({
        orderBy: { id: 'asc' },
        select: { organization: { select: { label: true } } },
        where: {
          userId,
          ...buildSearchWhere(search, {
            relations: { organization: ['label'] },
          }),
        },
      });
      return rows.map((row) => row.organization.label);
    }

    it.each([
      ['%', ['100% cotton']],
      ['_', ['a_b']],
      ['\\', ['back\\slash']],
      ['100%', ['100% cotton']],
      ['a_b', ['a_b']],
      ['COTTON', ['100% cotton', '100 cotton']],
    ])(
      'matches %j literally in every filter shape',
      async (search, expected) => {
        expect(await columnMatches(search)).toEqual(expected);
        expect(await jsonMatches(search)).toEqual(expected);
        expect(await relationMatches(search)).toEqual(expected);
      },
    );
  },
);
