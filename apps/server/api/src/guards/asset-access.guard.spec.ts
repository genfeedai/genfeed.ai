import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { AssetScope } from '@genfeedai/enums';
import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

const makeContext = (
  params: Record<string, string>,
  user: unknown,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ params, user }),
    }),
  }) as unknown as ExecutionContext;

describe('AssetAccessGuard', () => {
  let guard: AssetAccessGuard;
  let ingredientsService: vi.Mocked<IngredientsService>;

  const orgId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const clerkId = 'user_clerk_abc123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetAccessGuard,
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AssetAccessGuard>(AssetAccessGuard);
    ingredientsService = module.get(IngredientsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('when assetId is missing', () => {
    it('should throw NotFoundException when no ingredientId or id param', async () => {
      const ctx = makeContext({}, null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
    });
  });

  describe('when asset is not found', () => {
    it('should throw NotFoundException when ingredientsService returns null', async () => {
      ingredientsService.findOne.mockResolvedValue(null);
      const ctx = makeContext({ ingredientId: 'asset-123' }, null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        _id: 'asset-123',
        isDeleted: false,
      });
    });
  });

  describe('PUBLIC scope', () => {
    it('should return true without authentication', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.PUBLIC,
      } as never);
      const ctx = makeContext({ ingredientId: 'asset-123' }, null);
      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('should return true with authenticated user', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.PUBLIC,
      } as never);
      const ctx = makeContext(
        { ingredientId: 'asset-123' },
        { id: clerkId, publicMetadata: { organization: orgId } },
      );
      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('ORGANIZATION scope', () => {
    it('should throw UnauthorizedException when unauthenticated', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: orgId },
        scope: AssetScope.ORGANIZATION,
        user: new Types.ObjectId(),
      } as never);
      const ctx = makeContext({ id: 'asset-123' }, null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return true when user is owner via clerkId', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: new Types.ObjectId(orgId) },
        scope: AssetScope.ORGANIZATION,
        user: { _id: new Types.ObjectId(), clerkId },
      } as never);
      const user = {
        id: clerkId,
        publicMetadata: { organization: new Types.ObjectId().toString() },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user objectId matches asset user', async () => {
      const assetUserId = new Types.ObjectId();
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: new Types.ObjectId() },
        scope: AssetScope.ORGANIZATION,
        user: assetUserId,
      } as never);
      const user = {
        id: 'other',
        publicMetadata: {
          organization: new Types.ObjectId().toString(),
          user: assetUserId.toString(),
        },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user shares organization', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: new Types.ObjectId(orgId) },
        scope: AssetScope.ORGANIZATION,
        user: new Types.ObjectId(),
      } as never);
      const user = {
        id: 'other',
        publicMetadata: { organization: orgId, user: userId },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should throw ForbiddenException when organization does not match', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: new Types.ObjectId() },
        scope: AssetScope.ORGANIZATION,
        user: new Types.ObjectId(),
      } as never);
      const user = {
        id: 'other',
        publicMetadata: {
          organization: new Types.ObjectId().toString(),
          user: userId,
        },
      };
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle raw ObjectId (non-populated) organization field', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: new Types.ObjectId(orgId),
        scope: AssetScope.ORGANIZATION,
        user: new Types.ObjectId(),
      } as never);
      const user = {
        id: 'other',
        publicMetadata: { organization: orgId, user: userId },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });
  });

  describe('BRAND scope', () => {
    it('should throw UnauthorizedException when unauthenticated', async () => {
      ingredientsService.findOne.mockResolvedValue({
        brand: { _id: brandId },
        scope: AssetScope.BRAND,
        user: new Types.ObjectId(),
      } as never);
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, null)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return true when user is owner via clerkId', async () => {
      ingredientsService.findOne.mockResolvedValue({
        brand: { _id: new Types.ObjectId(brandId) },
        scope: AssetScope.BRAND,
        user: { _id: new Types.ObjectId(), clerkId },
      } as never);
      const user = {
        id: clerkId,
        publicMetadata: { brand: new Types.ObjectId().toString() },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user shares brand', async () => {
      ingredientsService.findOne.mockResolvedValue({
        brand: { _id: new Types.ObjectId(brandId) },
        scope: AssetScope.BRAND,
        user: new Types.ObjectId(),
      } as never);
      const user = {
        id: 'other',
        publicMetadata: { brand: brandId, user: userId },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should throw ForbiddenException when brand does not match', async () => {
      ingredientsService.findOne.mockResolvedValue({
        brand: { _id: new Types.ObjectId() },
        scope: AssetScope.BRAND,
        user: new Types.ObjectId(),
      } as never);
      const user = {
        id: 'other',
        publicMetadata: {
          brand: new Types.ObjectId().toString(),
          user: userId,
        },
      };
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('USER scope', () => {
    it('should throw UnauthorizedException when unauthenticated', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.USER,
        user: new Types.ObjectId(),
      } as never);
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, null)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return true when user is owner via clerkId', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.USER,
        user: { _id: new Types.ObjectId(), clerkId },
      } as never);
      const user = { id: clerkId, publicMetadata: { user: userId } };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user objectId matches', async () => {
      const assetUserId = new Types.ObjectId();
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.USER,
        user: assetUserId,
      } as never);
      const user = {
        id: 'other',
        publicMetadata: { user: assetUserId.toString() },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should throw ForbiddenException when user is not the owner', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.USER,
        user: new Types.ObjectId(),
      } as never);
      const user = {
        id: 'other',
        publicMetadata: { user: new Types.ObjectId().toString() },
      };
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('param fallback', () => {
    it('should use req.params.id when ingredientId is absent', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.PUBLIC,
      } as never);
      await guard.canActivate(makeContext({ id: 'via-id-param' }, null));
      expect(ingredientsService.findOne).toHaveBeenCalledWith({
        _id: 'via-id-param',
        isDeleted: false,
      });
    });
  });

  describe('unknown scope', () => {
    it('should throw ForbiddenException for unrecognized scope', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: 'unknown' as AssetScope,
        user: new Types.ObjectId(),
      } as never);
      const user = { id: clerkId, publicMetadata: { user: userId } };
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
