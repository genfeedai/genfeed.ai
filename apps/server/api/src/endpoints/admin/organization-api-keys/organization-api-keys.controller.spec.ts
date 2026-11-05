import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationApiKeysController } from '@api/endpoints/admin/organization-api-keys/organization-api-keys.controller';
import { AdminOrganizationApiKeysService } from '@api/endpoints/admin/organization-api-keys/organization-api-keys.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

interface StoredKey {
  defaultBrandId?: string | null;
  expiresAt?: string | null;
  id: string;
  key: string;
  label: string;
  metadata: Record<string, unknown> | null;
  organizationId: string;
  scopes: string[];
  userId: string;
}

const OPERATOR_REQUEST = { context: { userId: 'operator-1' } } as never;

/** The slice of Prisma the mint path reads and writes, kept in memory. */
function createFakeDatabase() {
  const keys: StoredKey[] = [];
  const prisma = {
    apiKey: {
      create: async ({ data }: { data: Omit<StoredKey, 'id'> }) => {
        const stored = { ...data, id: `key-${keys.length + 1}` };
        keys.push(stored);
        return stored;
      },
    },
    brand: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) =>
        where.id === 'brand-1' && where.organizationId === 'org-1'
          ? { id: 'brand-1' }
          : null,
    },
    organization: {
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === 'org-1' ? { id: 'org-1', userId: 'owner-1' } : null,
    },
  };
  return { keys, prisma };
}

function createController() {
  const database = createFakeDatabase();
  const logger = { debug: () => undefined, error: () => undefined };
  const apiKeysService = new ApiKeysService(
    database.prisma as never,
    logger as never,
    { isProduction: false } as never,
    {} as never,
    {} as never,
  );
  const service = new AdminOrganizationApiKeysService(
    database.prisma as never,
    apiKeysService,
  );
  return {
    ...database,
    controller: new AdminOrganizationApiKeysController(service),
  };
}

describe('admin partner API key mint', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOrganizationApiKeysController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('mints a key with image generation and brand context, owned by the organization owner', async () => {
    const { controller, keys } = createController();

    const { data } = await controller.mintPartnerKey(
      OPERATOR_REQUEST,
      'org-1',
      { defaultBrandId: 'brand-1', label: 'Partner app' },
    );

    expect(data).toMatchObject({
      defaultBrandId: 'brand-1',
      expiresAt: null,
      label: 'Partner app',
      organizationId: 'org-1',
      scopes: [
        'images:read',
        'images:create',
        'images:update',
        'images:delete',
        'brands:read',
        'brands:write',
      ],
      userId: 'owner-1',
    });
    expect(data.key.startsWith('gf_test_')).toBe(true);
    expect(keys).toHaveLength(1);
    expect(keys[0].key).not.toBe(data.key);
    expect(keys[0].metadata).toEqual({
      kind: 'partner',
      mintedByUserId: 'operator-1',
    });
  });

  it('mints the levels the admin asks for', async () => {
    const { controller } = createController();

    const { data } = await controller.mintPartnerKey(
      OPERATOR_REQUEST,
      'org-1',
      {
        label: 'Read-only partner',
        levels: { brands: 'read', images: 'none', videos: 'read' },
      },
    );

    expect(data.scopes).toEqual(['videos:read', 'brands:read']);
  });

  it.each([
    ['a level the resource does not offer', { analytics: 'write' }],
    ['an unknown resource', { posts: 'read' }],
    ['an unknown level', { images: 'admin' }],
  ])('rejects %s', async (_case, levels) => {
    const { controller, keys } = createController();

    await expect(
      controller.mintPartnerKey(OPERATOR_REQUEST, 'org-1', {
        label: 'Partner app',
        levels,
      }),
    ).rejects.toThrow(/levels must be none, read or write/);
    expect(keys).toHaveLength(0);
  });

  it('rejects a key that would grant nothing', async () => {
    const { controller, keys } = createController();

    await expect(
      controller.mintPartnerKey(OPERATOR_REQUEST, 'org-1', {
        label: 'Empty',
        levels: { images: 'none' },
      }),
    ).rejects.toThrow(/at least one scope/);
    expect(keys).toHaveLength(0);
  });

  it('rejects an unknown organization and writes nothing', async () => {
    const { controller, keys } = createController();

    await expect(
      controller.mintPartnerKey(OPERATOR_REQUEST, 'org-missing', {
        label: 'Partner app',
      }),
    ).rejects.toThrow(/not found/i);
    expect(keys).toHaveLength(0);
  });

  it('rejects a default brand from another organization', async () => {
    const { controller, keys } = createController();

    await expect(
      controller.mintPartnerKey(OPERATOR_REQUEST, 'org-1', {
        defaultBrandId: 'brand-other-org',
        label: 'Partner app',
      }),
    ).rejects.toThrow(/defaultBrandId/);
    expect(keys).toHaveLength(0);
  });

  it('sets the expiry from expiresInDays', async () => {
    const { controller } = createController();
    const before = Date.now();

    const { data } = await controller.mintPartnerKey(
      OPERATOR_REQUEST,
      'org-1',
      { expiresInDays: 30, label: 'Trial partner' },
    );

    const expiresAt = new Date(data.expiresAt ?? 0).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(30 * 86_400_000);
    expect(expiresAt - before).toBeLessThan(30 * 86_400_000 + 60_000);
  });
});
