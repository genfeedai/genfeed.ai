import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysController } from '@api/collections/api-keys/controllers/api-keys.controller';
import type { ApiKeysQueryDto } from '@api/collections/api-keys/dto/api-keys-query.dto';
import type { UpdateApiKeyDto } from '@api/collections/api-keys/dto/update-api-key.dto';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { McpConnectionVerificationService } from '@api/collections/api-keys/services/mcp-connection-verification.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ApiKeyCategory } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

const databaseUrl = assertIsolatedDatabaseUrl();
const fixtureId = randomUUID();
const userId = `api-key-user-${fixtureId}`;
const organizationId = `api-key-org-a-${fixtureId}`;
const otherOrganizationId = `api-key-org-b-${fixtureId}`;
const activeKeyId = `api-key-a-${fixtureId}`;
const foreignKeyId = `api-key-b-${fixtureId}`;
const organizationIds = [organizationId, otherOrganizationId];
const keyIds = new Set([activeKeyId, foreignKeyId]);
const request = { originalUrl: '/api-keys', url: '/api-keys' } as Request;
const user: AuthenticatedUser = {
  id: userId,
  userId,
  organizationId,
  brandId: '',
};
const query: ApiKeysQueryDto = {
  isDeleted: false,
  limit: 100,
  page: 1,
  sort: 'createdAt: -1',
};

const config = {
  get: (key: string) =>
    key === 'DATABASE_URL'
      ? databaseUrl
      : key === 'GENFEED_CLOUD'
        ? 'true'
        : undefined,
  isProduction: false,
} as unknown as ConfigService;
const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
} as unknown as LoggerService;
const redis = { getPublisher: vi.fn() } as unknown as RedisService;
const cache = {
  invalidate: vi.fn(),
  invalidateByTags: vi.fn(),
} as unknown as CacheInvalidationService;
const mcp = { verify: vi.fn() } as unknown as McpConnectionVerificationService;

describe('API-key organization scope (real PostgreSQL)', () => {
  let prisma: PrismaService;
  let controller: ApiKeysController;

  beforeAll(async () => {
    prisma = new PrismaService(config);
    await prisma.$connect();
    controller = new ApiKeysController(
      new ApiKeysService(prisma, logger, config, redis, cache),
      mcp,
    );
    await prisma.user.create({ data: { id: userId, handle: userId } });
    await prisma.organization.createMany({
      data: organizationIds.map((id) => ({ id, userId, label: id, slug: id })),
    });
  });

  beforeEach(async () => {
    await prisma.apiKey.createMany({
      data: [
        {
          id: activeKeyId,
          organizationId,
          userId,
          label: 'Active organization key',
          key: `stored-a-${fixtureId}`,
          scopes: ['videos:read'],
        },
        {
          id: foreignKeyId,
          organizationId: otherOrganizationId,
          userId,
          label: 'Foreign organization key',
          key: `stored-b-${fixtureId}`,
          scopes: ['videos:read'],
        },
      ],
    });
  });

  async function cleanupKeys() {
    await prisma.apiKey.deleteMany({
      where: {
        id: { in: [...keyIds] },
        userId,
        organizationId: { in: organizationIds },
      },
    });
  }

  afterEach(cleanupKeys);

  afterAll(async () => {
    if (!prisma) return;
    try {
      await cleanupKeys();
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds }, userId },
      });
      await prisma.user.deleteMany({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('lists and reads only the selected organization keys for the same canonical user', async () => {
    const activeList = await controller.findAll(request, user, query);
    expect(activeList.data.map((key) => key.id)).toEqual([activeKeyId]);
    const foreignList = await controller.findAll(
      request,
      { ...user, organizationId: otherOrganizationId },
      query,
    );
    expect(foreignList.data.map((key) => key.id)).toEqual([foreignKeyId]);
    const detail = await controller.findOne(request, user, activeKeyId);
    expect(detail.data).toMatchObject({
      id: activeKeyId,
      attributes: { label: 'Active organization key' },
    });
  });

  it.each(['findOne', 'update', 'revoke', 'rotate'] as const)(
    'denies foreign %s without changing its database row',
    async (operation) => {
      const before = await prisma.apiKey.findUniqueOrThrow({
        where: { id: foreignKeyId, organizationId: otherOrganizationId },
      });
      const result =
        operation === 'update'
          ? controller.update(request, user, foreignKeyId, {
              label: 'Cross-organization change',
            } as UpdateApiKeyDto)
          : controller[operation](request, user, foreignKeyId);
      await expect(result).rejects.toBeInstanceOf(HttpException);
      expect(
        await prisma.apiKey.findUniqueOrThrow({
          where: { id: foreignKeyId, organizationId: otherOrganizationId },
        }),
      ).toEqual(before);
      expect(
        await prisma.apiKey.count({
          where: { userId, organizationId: { in: organizationIds } },
        }),
      ).toBe(2);
    },
  );

  it('updates the selected key and leaves the foreign key unchanged', async () => {
    const foreignBefore = await prisma.apiKey.findUniqueOrThrow({
      where: { id: foreignKeyId, organizationId: otherOrganizationId },
    });
    await controller.update(request, user, activeKeyId, {
      label: 'Updated in active organization',
    } as UpdateApiKeyDto);
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: activeKeyId, organizationId },
      }),
    ).toMatchObject({
      label: 'Updated in active organization',
      userId,
      organizationId,
    });
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: foreignKeyId, organizationId: otherOrganizationId },
      }),
    ).toEqual(foreignBefore);
  });

  it('revokes the selected key in storage and excludes it from active lists', async () => {
    const foreignBefore = await prisma.apiKey.findUniqueOrThrow({
      where: { id: foreignKeyId, organizationId: otherOrganizationId },
    });
    await controller.revoke(request, user, activeKeyId);
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: activeKeyId, organizationId },
      }),
    ).toMatchObject({ isRevoked: true, revokedAt: expect.any(Date) });
    expect((await controller.findAll(request, user, query)).data).toEqual([]);
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: foreignKeyId, organizationId: otherOrganizationId },
      }),
    ).toEqual(foreignBefore);
  });

  it('creates and rotates a key in the selected organization through real persistence', async () => {
    const created = await controller.create(request, user, {
      label: 'Created organization key',
      scopes: ['videos:read'],
      category: ApiKeyCategory.GENFEEDAI,
    });
    assert(created.data, 'Create must return the serialized API key');
    keyIds.add(created.data.id);
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: created.data.id, organizationId },
      }),
    ).toMatchObject({ userId, organizationId, isRevoked: false });
    const rotated = await controller.rotate(request, user, created.data.id);
    assert(rotated.data, 'Rotate must return the serialized replacement key');
    keyIds.add(rotated.data.id);
    expect(rotated.data.id).not.toBe(created.data.id);
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: created.data.id, organizationId },
      }),
    ).toMatchObject({ isRevoked: true, revokedAt: expect.any(Date) });
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: rotated.data.id, organizationId },
      }),
    ).toMatchObject({ userId, organizationId, isRevoked: false });
    expect(
      await prisma.apiKey.findUniqueOrThrow({
        where: { id: foreignKeyId, organizationId: otherOrganizationId },
      }),
    ).toMatchObject({ isRevoked: false, revokedAt: null });
  });
});
