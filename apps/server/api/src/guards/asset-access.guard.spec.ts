import {
  AssetAccessGuard,
  normalizeAssetScope,
} from '@api/guards/asset-access.guard';
import { AssetScope } from '@genfeedai/contracts';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('normalizeAssetScope', () => {
  it('maps Prisma UPPER_SNAKE scopes onto the AssetScope enum', () => {
    expect(normalizeAssetScope('USER')).toBe(AssetScope.USER);
    expect(normalizeAssetScope('BRAND')).toBe(AssetScope.BRAND);
    expect(normalizeAssetScope('ORGANIZATION')).toBe(AssetScope.ORGANIZATION);
    expect(normalizeAssetScope('PUBLIC')).toBe(AssetScope.PUBLIC);
  });

  it('accepts app-lowercase scopes as-is', () => {
    expect(normalizeAssetScope('user')).toBe(AssetScope.USER);
    expect(normalizeAssetScope('public')).toBe(AssetScope.PUBLIC);
  });

  it('defaults empty or unknown values to USER', () => {
    expect(normalizeAssetScope(undefined)).toBe(AssetScope.USER);
    expect(normalizeAssetScope('')).toBe(AssetScope.USER);
    expect(normalizeAssetScope('not-a-scope')).toBe(AssetScope.USER);
  });
});

describe('AssetAccessGuard', () => {
  const findOne = vi.fn();
  const guard = new AssetAccessGuard({
    findOne,
  } as never);

  function createContext(params: {
    assetId?: string;
    user?: {
      brandId?: string;
      id: string;
      organizationId?: string;
      userId?: string;
    };
  }) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          params: { ingredientId: params.assetId ?? 'ing-1' },
          user: params.user,
        }),
      }),
    } as never;
  }

  beforeEach(() => {
    findOne.mockReset();
  });

  it('allows the owner of a Prisma USER-scoped asset (uppercase enum)', async () => {
    findOne.mockResolvedValue({
      id: 'ing-1',
      scope: 'USER',
      userId: 'user_db_1',
    });

    await expect(
      guard.canActivate(
        createContext({
          user: {
            id: 'jwt-sub',
            userId: 'user_db_1',
          },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a non-owner of a USER-scoped asset', async () => {
    findOne.mockResolvedValue({
      id: 'ing-1',
      scope: 'USER',
      userId: 'user_db_1',
    });

    await expect(
      guard.canActivate(
        createContext({
          user: {
            id: 'jwt-sub',
            userId: 'someone-else',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires auth for non-public scopes', async () => {
    findOne.mockResolvedValue({
      id: 'ing-1',
      scope: 'USER',
      userId: 'user_db_1',
    });

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows anyone for PUBLIC scope', async () => {
    findOne.mockResolvedValue({
      id: 'ing-1',
      scope: 'PUBLIC',
      userId: 'user_db_1',
    });

    await expect(guard.canActivate(createContext({}))).resolves.toBe(true);
  });
});
