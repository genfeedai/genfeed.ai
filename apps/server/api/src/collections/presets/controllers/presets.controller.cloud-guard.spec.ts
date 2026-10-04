import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { PresetsQueryDto } from '@api/collections/presets/dto/presets-query.dto';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { ConflictException } from '@nestjs/common';
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
  config: Record<string, unknown>;
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
    if (field === 'AND') {
      return (expected as Where[]).every((arm) => matches(row, arm));
    }
    if (
      field === 'config' &&
      typeof expected === 'object' &&
      expected !== null &&
      'path' in expected
    ) {
      const { equals, path } = expected as { equals: unknown; path: string[] };
      return row.config[path[0] ?? ''] === equals;
    }
    if (
      typeof expected === 'object' &&
      expected !== null &&
      'not' in expected
    ) {
      return (row as unknown as Where)[field] !== (expected as Where).not;
    }
    return (row as unknown as Where)[field] === expected;
  });
}

/**
 * In-memory `preset` delegate that runs the real CLOUD tenant guard on
 * every call, exactly like the Prisma `$allOperations` extension.
 */
function buildPrisma(rows: Row[]) {
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'Preset',
      operation,
      tenantModelNames: new Set(['Preset']),
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
    create: vi.fn(async (args: { data: Partial<Row> }) => {
      guard('create', args);
      const row = {
        id: `cnew${rows.length}`.padEnd(24, '0'),
        isActive: true,
        isDeleted: false,
        key: String(args.data.config?.key),
        organizationId: null,
        sortOrder: 0,
        ...args.data,
      } as Row;
      rows.push(row);
      return row;
    }),
    update: vi.fn(async (args: { data: Partial<Row>; where: Where }) => {
      guard('update', args);
      const row = rows.find((candidate) => matches(candidate, args.where));
      if (!row) {
        throw Object.assign(new Error('not found'), { code: 'P2025' });
      }
      Object.assign(row, args.data);
      return row;
    }),
  };

  // The real client reports the same CLOUD gate its guard extension uses.
  return {
    isCloudTenantGuard: true,
    preset: delegate,
  } as unknown as PrismaService;
}

function buildRows(): Row[] {
  return [
    {
      id: DEFAULT_ID,
      isActive: true,
      isDeleted: false,
      config: { key: 'anime', label: 'Old' },
      key: 'anime',
      organizationId: null,
      sortOrder: 0,
    },
    {
      id: INACTIVE_DEFAULT_ID,
      isActive: false,
      isDeleted: false,
      config: { key: 'retired', label: 'Old' },
      key: 'retired',
      organizationId: null,
      sortOrder: 0,
    },
    {
      id: OWN_ID,
      isActive: true,
      isDeleted: false,
      config: { key: 'mine', label: 'Old' },
      key: 'mine',
      organizationId: ORG,
      sortOrder: 0,
    },
    {
      id: OTHER_ID,
      isActive: true,
      isDeleted: false,
      config: { key: 'theirs', label: 'Old' },
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
  const service = new PresetsService(buildPrisma(rows), logger);
  const controller = new PresetsController(service, logger);
  const inTenant = <T>(callback: () => Promise<T>) =>
    runWithTenantContext({ organizationId: ORG }, callback);

  return { controller, inTenant, rows, service };
}

const request = {} as Request;

describe('PresetsController under the CLOUD tenant guard', () => {
  it('scopes the inherited id-only write to the tenant, so a platform default stays unreachable', async () => {
    const { inTenant, rows, service } = setup();

    // BaseService adds the request tenant; the platform row (no organization)
    // matches no write, and the guard no longer rejects the query itself.
    await expect(
      inTenant(() => service.patch(DEFAULT_ID, { isActive: false })),
    ).rejects.toMatchObject({ code: 'P2025' });
    expect(rows.find((row) => row.id === DEFAULT_ID)?.isActive).toBe(true);
  });

  it('lets a superadmin edit, reorder and deactivate a platform default', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(true), DEFAULT_ID, {
        isActive: false,
        label: 'Anime 2',
      } as never),
    );

    expect(rows.find((row) => row.id === DEFAULT_ID)).toMatchObject({
      isActive: false,
      organizationId: null,
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
        isActive: false,
      } as never),
    );
    await inTenant(() => controller.remove(request, buildUser(false), OWN_ID));

    expect(rows.find((row) => row.id === OWN_ID)).toMatchObject({
      isActive: false,
      isDeleted: true,
    });
  });

  it('answers not-found for a member write to a default or to another organization', async () => {
    const { controller, inTenant, rows } = setup();
    const member = buildUser(false);

    for (const id of [DEFAULT_ID, OTHER_ID]) {
      await expect(
        inTenant(() =>
          controller.patch(request, member, id, { isActive: false } as never),
        ),
      ).rejects.toThrow();
      await expect(
        inTenant(() => controller.remove(request, member, id)),
      ).rejects.toThrow();
    }

    expect(rows.find((row) => row.id === DEFAULT_ID)).toMatchObject({
      isActive: true,
      isDeleted: false,
    });
    expect(rows.find((row) => row.id === OTHER_ID)?.isDeleted).toBe(false);
  });

  it('reads an active default and hides foreign rows from members', async () => {
    const { controller, inTenant } = setup();
    const member = buildUser(false);

    await expect(
      inTenant(() => controller.findOne(request, member, DEFAULT_ID)),
    ).resolves.toBeDefined();
    for (const id of [OTHER_ID]) {
      await expect(
        inTenant(() => controller.findOne(request, member, id)),
      ).rejects.toThrow();
    }
  });

  it('lists defaults plus own rows through the guard', async () => {
    const { controller, inTenant, service } = setup();

    const result = await inTenant(() =>
      service.findAll(
        controller.buildFindAllQuery(buildUser(false), {} as PresetsQueryDto),
        { pagination: false },
      ),
    );

    // The in-memory rows carry a `key` that the Preset model does not declare.
    expect(
      result.docs
        .map((row) => (row as typeof row & Pick<Row, 'key'>).key)
        .sort(),
    ).toEqual(['anime', 'mine', 'retired']);
  });

  it('patches a preset label into config instead of a Prisma column', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(true), DEFAULT_ID, {
        label: 'Updated',
      } as never),
    );

    const row = rows.find((candidate) => candidate.id === DEFAULT_ID);
    expect(row?.config).toEqual({ key: 'anime', label: 'Updated' });
    expect(row).not.toHaveProperty('label');
  });

  it('rejects renaming a platform default to an existing platform key', async () => {
    const { controller, inTenant } = setup();

    await expect(
      inTenant(() =>
        controller.patch(request, buildUser(true), DEFAULT_ID, {
          key: 'retired',
        } as never),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('renames a platform default for a superadmin who has an organization', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(true), DEFAULT_ID, {
        key: 'anime-v2',
      } as never),
    );

    expect(rows.find((row) => row.id === DEFAULT_ID)?.config.key).toBe(
      'anime-v2',
    );
  });

  it('allows a platform default to share a key with an organization preset', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.patch(request, buildUser(true), DEFAULT_ID, {
        key: 'mine',
      } as never),
    );

    expect(rows.find((row) => row.id === DEFAULT_ID)?.config.key).toBe('mine');
  });

  it('rejects an organization preset key already used in that organization', async () => {
    const { controller, inTenant } = setup();

    await expect(
      inTenant(() =>
        controller.create(request, buildUser(true), {
          key: 'mine',
          organizationId: ORG,
        } as never),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lets an organization preset reuse a platform default key', async () => {
    const { controller, inTenant, rows } = setup();

    await inTenant(() =>
      controller.create(request, buildUser(true), {
        key: 'anime',
        organizationId: ORG,
      } as never),
    );

    expect(
      rows
        .filter((row) => row.config.key === 'anime')
        .map((r) => r.organizationId),
    ).toEqual([null, ORG]);
  });

  it('creates a platform default and rejects a duplicate platform key', async () => {
    const { controller, inTenant } = setup();

    await inTenant(() =>
      controller.create(request, buildUser(true), { key: 'fresh' } as never),
    );
    await expect(
      inTenant(() =>
        controller.create(request, buildUser(true), { key: 'fresh' } as never),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      inTenant(() =>
        controller.create(request, buildUser(true), { key: 'anime' } as never),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ignores a key that only another organization owns', async () => {
    const { controller, inTenant } = setup();

    await inTenant(() =>
      controller.create(request, buildUser(true), { key: 'theirs' } as never),
    );
  });

  describe('findByKey', () => {
    it('prefers the caller organization over the platform default', async () => {
      const { inTenant, rows, service } = setup();
      rows.push({
        config: { key: 'anime' },
        id: 'cmine0000000000000000002',
        isActive: true,
        isDeleted: false,
        key: 'anime',
        organizationId: ORG,
        sortOrder: 0,
      });

      const preset = await inTenant(() => service.findByKey('anime', ORG));

      expect(preset.id).toBe('cmine0000000000000000002');
    });

    it('falls back to the platform default', async () => {
      const { inTenant, service } = setup();

      const preset = await inTenant(() => service.findByKey('anime', ORG));

      expect(preset.id).toBe(DEFAULT_ID);
    });

    it('never resolves a key owned by another organization', async () => {
      const { inTenant, service } = setup();

      await expect(
        inTenant(() => service.findByKey('theirs', ORG)),
      ).rejects.toThrow();
      await expect(
        inTenant(() => service.findByKey('theirs')),
      ).rejects.toThrow();
    });
  });
});
