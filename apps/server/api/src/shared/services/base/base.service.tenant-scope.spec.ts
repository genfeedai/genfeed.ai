import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  crossOrgUnsafe,
  runWithTenantContext,
} from '@libs/prisma/tenant-context';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

const ORG = 'org_own';

class TestService extends BaseService<Row> {}

// Prisma `where` as Postgres evaluates it on these rows: AND/OR arrays and
// equality, where `organizationId: null` only matches platform rows.
const satisfies = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Row[]).every((clause) => satisfies(row, clause));
    }
    if (key === 'OR') {
      return (condition as Row[]).some((clause) => satisfies(row, clause));
    }
    return row[key] === condition;
  });

/** A table holding own, deleted, foreign-organization and platform rows. */
function createTable() {
  const rows: Row[] = [
    {
      id: 'row_1',
      isDeleted: false,
      label: 'old',
      organizationId: ORG,
      slug: 'a',
      userId: 'u0',
    },
    {
      id: 'row_2',
      isDeleted: false,
      label: 'old',
      organizationId: ORG,
      slug: 'b',
      userId: 'u1',
    },
    {
      id: 'deleted_row',
      isDeleted: true,
      label: 'old',
      organizationId: ORG,
      slug: 'a',
      userId: 'u0',
    },
    {
      id: 'foreign_row',
      isDeleted: false,
      label: 'old',
      organizationId: 'org_foreign',
      slug: 'a',
      userId: 'u1',
    },
    {
      id: 'platform_row',
      isDeleted: false,
      label: 'old',
      organizationId: null,
      slug: 'a',
      userId: null,
    },
  ];
  const matching = (where: Row) => rows.filter((row) => satisfies(row, where));
  const delegate = {
    count: async ({ where }: { where: Row }) => matching(where).length,
    findFirst: async ({ where }: { where: Row }) => matching(where)[0] ?? null,
    findMany: async ({
      skip = 0,
      take,
      where,
    }: {
      skip?: number;
      take?: number;
      where: Row;
    }) =>
      matching(where).slice(skip, take === undefined ? undefined : skip + take),
    update: async ({ data, where }: { data: Row; where: Row }) => {
      const [row] = matching(where);
      if (!row) throw new Error('Record to update not found.');
      return Object.assign(row, data);
    },
    updateMany: async ({ data, where }: { data: Row; where: Row }) => {
      const hits = matching(where);
      for (const row of hits) Object.assign(row, data);
      return { count: hits.length };
    },
  };
  return { delegate, rows };
}

function createService(modelName: string, isCloudTenantGuard?: boolean) {
  const { delegate, rows } = createTable();
  const prisma = {
    [modelName]: delegate,
    ...(isCloudTenantGuard === undefined ? {} : { isCloudTenantGuard }),
  } as unknown as PrismaService;
  const logger = {
    debug: () => undefined,
    error: () => undefined,
    log: () => undefined,
    warn: () => undefined,
  } as unknown as LoggerService;
  const field = (id: string, key: string) =>
    rows.find((row) => row.id === id)?.[key];
  return { field, rows, service: new TestService(prisma, modelName, logger) };
}

const asTenant = <T>(work: () => Promise<T>) =>
  runWithTenantContext({ organizationId: ORG }, work);
const ids = (rows: Row[] | null) => (rows ?? []).map((row) => row.id);

describe('BaseService tenant scope', () => {
  describe('pure tenant model (brand)', () => {
    let world: ReturnType<typeof createService>;

    beforeEach(() => {
      world = createService('brand', true);
    });

    it.each([
      ['an own row', 'row_1', 'row_1'],
      ['a foreign row', 'foreign_row', null],
      ['a platform row', 'platform_row', null],
      ['a deleted own row', 'deleted_row', null],
    ])(
      'findOne by id reads %s only when it is the tenant',
      async (_case, id, expected) => {
        const row = await asTenant(() => world.service.findOne({ id }));

        expect(row?.id ?? null).toBe(expected);
      },
    );

    it('find and findAll list only the tenant rows', async () => {
      const [found, page, unpaginated] = await asTenant(() =>
        Promise.all([
          world.service.find({ slug: 'a' }),
          world.service.findAll(
            { where: { slug: 'a' } },
            { limit: 5, page: 1 },
          ),
          world.service.findAll(
            { where: { slug: 'a' } },
            { pagination: false },
          ),
        ]),
      );

      expect(ids(found)).toEqual(['row_1']);
      expect(ids(page.docs)).toEqual(['row_1']);
      expect(page.totalDocs).toBe(1);
      expect(ids(unpaginated.docs)).toEqual(['row_1']);
    });

    it.each([
      [
        'patch',
        (service: TestService, id: string) =>
          service.patch(id, { label: 'new' }),
        'label',
        'new',
      ],
      [
        'remove',
        (service: TestService, id: string) => service.remove(id),
        'isDeleted',
        true,
      ],
      [
        'updateEntityFlag',
        (service: TestService, id: string) =>
          service.updateEntityFlag(id, ORG, 'isRead' as keyof Row, true),
        'isRead',
        true,
      ],
    ])('%s writes an own row by id', async (_method, write, key, value) => {
      await asTenant(() => write(world.service, 'row_1'));

      expect(world.field('row_1', key)).toBe(value);
    });

    it.each([
      [
        'patch',
        (service: TestService, id: string) =>
          service.patch(id, { label: 'new' }),
      ],
      ['remove', (service: TestService, id: string) => service.remove(id)],
    ])(
      '%s never reaches another organization or a platform row through an id',
      async (_method, write) => {
        await expect(
          asTenant(() => write(world.service, 'foreign_row')),
        ).rejects.toThrow('Record to update not found.');
        await expect(
          asTenant(() => write(world.service, 'platform_row')),
        ).rejects.toThrow('Record to update not found.');

        expect(
          world.rows.slice(3).map(({ isDeleted, label }) => [label, isDeleted]),
        ).toEqual([
          ['old', false],
          ['old', false],
        ]);
      },
    );

    it('patchAll writes only the tenant rows', async () => {
      await asTenant(() =>
        world.service.patchAll({ slug: 'a' }, { label: 'new' }),
      );

      expect(world.rows.map(({ id, label }) => [id, label])).toEqual([
        ['row_1', 'new'],
        ['row_2', 'old'],
        ['deleted_row', 'old'],
        ['foreign_row', 'old'],
        ['platform_row', 'old'],
      ]);
    });

    it.each([
      [
        'an explicit tenant organization',
        { id: 'row_1', organizationId: ORG },
        'row_1',
      ],
      [
        'a caller OR that names the tenant',
        { OR: [{ organizationId: ORG }, { userId: 'u9' }], id: 'row_2' },
        'row_2',
      ],
    ])('keeps %s as the caller wrote it', async (_case, where, expected) => {
      const row = await asTenant(() => world.service.findOne(where));

      expect(row?.id).toBe(expected);
    });

    it('adds the tenant beside an organizationId:null filter, so no platform row leaks', async () => {
      const rows = await asTenant(() =>
        world.service.find({ organizationId: null }),
      );

      expect(rows).toEqual([]);
    });

    it('leaves queries unscoped without a tenant context (workers)', async () => {
      await world.service.patch('foreign_row', { label: 'new' });
      await world.service.remove('platform_row');
      await world.service.patchAll({ slug: 'b' }, { label: 'b' });

      expect(await world.service.findOne({ id: 'foreign_row' })).toMatchObject({
        label: 'new',
      });
      expect(world.field('platform_row', 'isDeleted')).toBe(true);
      expect(world.field('row_2', 'label')).toBe('b');
    });

    it('leaves a write unscoped inside crossOrgUnsafe', async () => {
      await asTenant(() =>
        crossOrgUnsafe(() =>
          world.service.patch('foreign_row', { label: 'new' }),
        ),
      );

      expect(world.field('foreign_row', 'label')).toBe('new');
    });
  });

  describe('platform-default model (tag)', () => {
    let world: ReturnType<typeof createService>;

    beforeEach(() => {
      world = createService('tag', true);
    });

    it.each([
      ['an own row', 'row_1', 'row_1'],
      ['a platform row', 'platform_row', 'platform_row'],
      ['a foreign row', 'foreign_row', null],
    ])(
      'findOne by id reads %s alongside the tenant rows',
      async (_case, id, expected) => {
        const row = await asTenant(() => world.service.findOne({ id }));

        expect(row?.id ?? null).toBe(expected);
      },
    );

    it.each([
      ['an AND clause', { AND: [{ slug: 'a' }] }, ['row_1', 'platform_row']],
      [
        'a null-only platform lookup',
        { organizationId: null },
        ['platform_row'],
      ],
    ])(
      'keeps %s and adds only the platform-or-tenant arm',
      async (_case, where, expected) => {
        const rows = await asTenant(() => world.service.find(where));

        expect(ids(rows)).toEqual(expected);
      },
    );

    it('never lets a tenant write a platform row', async () => {
      await expect(
        asTenant(() => world.service.patch('platform_row', { label: 'new' })),
      ).rejects.toThrow('Record to update not found.');
      await expect(
        asTenant(() => world.service.remove('platform_row')),
      ).rejects.toThrow('Record to update not found.');
      await asTenant(() =>
        world.service.patchAll({ slug: 'a' }, { label: 'new' }),
      );

      expect(
        world.rows.map(({ id, isDeleted, label }) => [id, label, isDeleted]),
      ).toEqual([
        ['row_1', 'new', false],
        ['row_2', 'old', false],
        ['deleted_row', 'old', true],
        ['foreign_row', 'old', false],
        ['platform_row', 'old', false],
      ]);
    });

    it('lets a superadmin write a platform row inside crossOrgUnsafe', async () => {
      await asTenant(() =>
        crossOrgUnsafe(() =>
          world.service.patch('platform_row', { label: 'new' }),
        ),
      );

      expect(world.field('platform_row', 'label')).toBe('new');
    });
  });

  describe('non-tenant model (user)', () => {
    it('does not add an organization scope', async () => {
      const world = createService('user', true);

      const row = await asTenant(async () => {
        await world.service.patch('foreign_row', { label: 'new' });
        return world.service.findOne({ id: 'foreign_row' });
      });

      expect(row).toMatchObject({ id: 'foreign_row', label: 'new' });
    });
  });

  describe('non-CLOUD mode (self-hosted single-tenant)', () => {
    it.each([
      ['brand', false],
      ['tag', false],
      ['brand', undefined],
    ])(
      'leaves %s queries as the caller wrote them under a tenant context (gate %s)',
      async (modelName, gate) => {
        const world = createService(modelName, gate);

        const [found, row] = await asTenant(async () => {
          await world.service.patch('foreign_row', { label: 'new' });
          await world.service.remove('platform_row');
          await world.service.patchAll({ slug: 'b' }, { label: 'b' });
          return Promise.all([
            world.service.find({ slug: 'a' }),
            world.service.findOne({ id: 'foreign_row' }),
          ]);
        });

        expect(ids(found)).toEqual(['row_1', 'foreign_row']);
        expect(row).toMatchObject({ label: 'new' });
        expect(world.field('platform_row', 'isDeleted')).toBe(true);
        expect(world.field('row_2', 'label')).toBe('b');
      },
    );
  });
});
