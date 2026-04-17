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

  const orgId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();
  const brandId = '507f191e810c19729de860ee'.toString();
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
        user: '507f191e810c19729de860ee',
      } as never);
      const ctx = makeContext({ id: 'asset-123' }, null);
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return true when user is owner via clerkId', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: orgId },
        scope: AssetScope.ORGANIZATION,
        user: { _id: '507f191e810c19729de860ee', clerkId },
      } as never);
      const user = {
        id: clerkId,
        publicMetadata: { organization: '507f191e810c19729de860ee'.toString() },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user objectId matches asset user', async () => {
      const assetUserId = '507f191e810c19729de860ee';
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: '507f191e810c19729de860ee' },
        scope: AssetScope.ORGANIZATION,
        user: assetUserId,
      } as never);
      const user = {
        id: 'other',
        publicMetadata: {
          organization: '507f191e810c19729de860ee'.toString(),
          user: assetUserId.toString(),
        },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user shares organization', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: { _id: orgId },
        scope: AssetScope.ORGANIZATION,
        user: '507f191e810c19729de860ee',
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
        organization: { _id: '507f191e810c19729de860ee' },
        scope: AssetScope.ORGANIZATION,
        user: '507f191e810c19729de860ee',
      } as never);
      const user = {
        id: 'other',
        publicMetadata: {
          organization: '507f191e810c19729de860ee'.toString(),
          user: userId,
        },
      };
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should handle raw ObjectId (non-populated) organization field', async () => {
      ingredientsService.findOne.mockResolvedValue({
        organization: orgId,
        scope: AssetScope.ORGANIZATION,
        user: '507f191e810c19729de860ee',
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
        user: '507f191e810c19729de860ee',
      } as never);
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, null)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return true when user is owner via clerkId', async () => {
      ingredientsService.findOne.mockResolvedValue({
        brand: { _id: brandId },
        scope: AssetScope.BRAND,
        user: { _id: '507f191e810c19729de860ee', clerkId },
      } as never);
      const user = {
        id: clerkId,
        publicMetadata: { brand: '507f191e810c19729de860ee'.toString() },
      };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user shares brand', async () => {
      ingredientsService.findOne.mockResolvedValue({
        brand: { _id: brandId },
        scope: AssetScope.BRAND,
        user: '507f191e810c19729de860ee',
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
        brand: { _id: '507f191e810c19729de860ee' },
        scope: AssetScope.BRAND,
        user: '507f191e810c19729de860ee',
      } as never);
      const user = {
        id: 'other',
        publicMetadata: {
          brand: '507f191e810c19729de860ee'.toString(),
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
        user: '507f191e810c19729de860ee',
      } as never);
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, null)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return true when user is owner via clerkId', async () => {
      ingredientsService.findOne.mockResolvedValue({
        scope: AssetScope.USER,
        user: { _id: '507f191e810c19729de860ee', clerkId },
      } as never);
      const user = { id: clerkId, publicMetadata: { user: userId } };
      expect(
        await guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).toBe(true);
    });

    it('should return true when user objectId matches', async () => {
      const assetUserId = '507f191e810c19729de860ee';
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
        user: '507f191e810c19729de860ee',
      } as never);
      const user = {
        id: 'other',
        publicMetadata: { user: '507f191e810c19729de860ee'.toString() },
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
        user: '507f191e810c19729de860ee',
      } as never);
      const user = { id: clerkId, publicMetadata: { user: userId } };
      await expect(
        guard.canActivate(makeContext({ ingredientId: 'x' }, user)),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
