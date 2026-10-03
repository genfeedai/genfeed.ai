import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsStylesController } from '@api/collections/elements/styles/controllers/styles.controller';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

type Row = {
  id: string;
  isActive: boolean;
  isDeleted: boolean;
  key: string;
  organizationId: string | null;
  sortOrder: number;
};

type Where = Record<string, unknown>;

const ORG = 'org-1';
const DEFAULT_ID = 'cdefault0000000000000001';
const INACTIVE_DEFAULT_ID = 'cdefault0000000000000002';
const OWN_ID = 'cown00000000000000000001';
const OTHER_ID = 'cother0000000000000000001';

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([field, expected]) => {
    if (field === 'OR') {
      return (expected as Where[]).some((arm) => matches(row, arm));
    }
    return (row as unknown as Where)[field] === expected;
  });
}

/**
 * In-memory `elementStyle` delegate that runs the real CLOUD tenant guard on
 * every call, exactly like the Prisma `$allOperations` extension.
 */
function buildPrisma(rows: Row[]) {
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'ElementStyle',
      operation,
      tenantModelNames: new Set(['ElementStyle']),
    });

  const delegate = {
    findFirst: vi.fn(async (args: { where: Where }) => {
      guard('findFirst', args);
      return rows.find((row) => matches(row, args.where)) ?? null;
    }),
    findMany: vi.fn(async (args: { where: Where }) => {
      guard('findMany', args);
      return rows.filter((row) => matches(row, args.where));
    }),
    update: vi.fn(async (args: { data: Partial<Row>; where: Where }) => {
      guard('update', args);
      const row = rows.find((candidate) => matches(candidate, args.where));
      if (!row) {
        throw new Error('not found');
      }
      Object.assign(row, args.data);
      return row;
    }),
    updateMany: vi.fn(async (args: { data: Partial<Row>; where: Where }) => {
      guard('updateMany', args);
      const hit = rows.filter((row) => matches(row, args.where));
      for (const row of hit) {
        Object.assign(row, args.data);
      }
      return { count: hit.length };
    }),
  };

  return { elementStyle: delegate } as unknown as PrismaService;
}

function buildRows(): Row[] {
  return [
    {
      id: DEFAULT_ID,
      isActive: true,
      isDeleted: false,
      key: 'anime',
      organizationId: null,
      sortOrder: 0,
    },
    {
      id: INACTIVE_DEFAULT_ID,
      isActive: false,
      isDeleted: false,
      key: 'retired',
      organizationId: null,
      sortOrder: 0,
    },
    {
      id: OWN_ID,
      isActive: true,
      isDeleted: false,
      key: 'mine',
      organizationId: ORG,
      sortOrder: 0,
    },
    {
      id: OTHER_ID,
      isActive: true,
      isDeleted: false,
      key: 'theirs',
      organizationId: 'org-2',
      sortOrder: 0,
    },
  ];
}

function buildUser(isSuperAdmin: boolean): AuthenticatedUser {
  return {
    id: 'user-1',
    isSuperAdmin,
    organizationId: ORG,
    userId: 'user-1',
  } as AuthenticatedUser;
}

function setup() {
  const rows = buildRows();
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
  const service = new ElementsStylesService(
    buildPrisma(rows),
    logger,
    undefined as never,
  );
  const controller = new ElementsStylesController(service, logger);
  const inTenant = <T>(callback: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, callback);

  return { controller, inTenant, rows, service };
}

const request = {} as Request;

describe('ElementsCRUDController under the CLOUD tenant guard', () => {
  it('proves the guard rejects the inherited id-only write', async () => {
    const { inTenant, service } = setup();

    await expect(
      inTenant(() => service.patch(DEFAULT_ID, { isActive: false })),
    ).rejects.toBeInstanceOf(TenantIsolationError);
  });

  it('lets a superadmin edit, reorder and deactivate a platform default', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(true), DEFAULT_ID, {
        isActive: false,
        label: 'Anime 2',
        sortOrder: 40,
      } as never),
    );

    expect(rows.find((row) => row.id === DEFAULT_ID)).toMatchObject({
      isActive: false,
      organizationId: null,
      sortOrder: 40,
    });
  });

  it('lets a superadmin delete a platform default', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.remove(request, buildUser(true), DEFAULT_ID),
    );

    expect(rows.find((row) => row.id === DEFAULT_ID)?.isDeleted).toBe(true);
  });

  it('lets a superadmin manage an inactive default', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(true), INACTIVE_DEFAULT_ID, {
        isActive: true,
      } as never),
    );

    expect(rows.find((row) => row.id === INACTIVE_DEFAULT_ID)?.isActive).toBe(
      true,
    );
  });

  it('lets a member edit and delete their own element', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(false), OWN_ID, {
        sortOrder: 5,
      } as never),
    );
    await inTenant(() => controller.remove(request, buildUser(false), OWN_ID));

    expect(rows.find((row) => row.id === OWN_ID)).toMatchObject({
      isDeleted: true,
      sortOrder: 5,
    });
  });

  it('answers not-found for a member write to a default or to another organization', async () => {
    const { controller, inTenant, rows } = setup();
    const member = buildUser(false);

    for (const id of [DEFAULT_ID, OTHER_ID]) {
      await expect(
        inTenant(() =>
          controller.patch(request, member, id, { sortOrder: 9 } as never),
        ),
      ).rejects.toThrow();
      await expect(
        inTenant(() => controller.remove(request, member, id)),
      ).rejects.toThrow();
    }

    expect(rows.find((row) => row.id === DEFAULT_ID)).toMatchObject({
      isDeleted: false,
      sortOrder: 0,
    });
    expect(rows.find((row) => row.id === OTHER_ID)?.isDeleted).toBe(false);
  });

  it('reads an active default and hides inactive and foreign rows from members', async () => {
    const { controller, inTenant } = setup();
    const member = buildUser(false);

    await expect(
      inTenant(() => controller.findOne(request, member, DEFAULT_ID)),
    ).resolves.toBeDefined();
    for (const id of [INACTIVE_DEFAULT_ID, OTHER_ID]) {
      await expect(
        inTenant(() => controller.findOne(request, member, id)),
      ).rejects.toThrow();
    }
  });

  it('lists defaults plus own rows through the guard', async () => {
    const { controller, inTenant, service } = setup();

    const result = await inTenant(() =>
      service.findAll(controller.buildFindAllQuery(buildUser(false), {}), {
        pagination: false,
      }),
    );

    expect(result.docs.map((row) => row.key).sort()).toEqual(['anime', 'mine']);
  });
});
