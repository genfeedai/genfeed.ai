import { AssetsController } from '@api/collections/assets/controllers/assets.controller';
import type { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import type { Asset } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { User } from '@clerk/backend';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('AssetsController', () => {
  let controller: AssetsController;
  let service: AssetsService;

  const mockUserId = new Types.ObjectId();
  const mockOrgId = new Types.ObjectId();
  const mockBrandId = new Types.ObjectId();
  const mockAssetId = new Types.ObjectId();

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: mockBrandId.toString(),
      clerkId: 'user_123',
      organization: mockOrgId.toString(),
      user: mockUserId.toString(),
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/assets',
    params: {},
    query: {},
  } as unknown as Request;

  const mockAsset = {
    _id: mockAssetId,
    category: AssetCategory.LOGO,
    isDeleted: false,
    parent: mockBrandId,
    parentModel: AssetParent.BRAND,
    user: mockUserId,
  } as unknown as Asset;

  const mockAssetsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    patchAll: vi.fn(),
    remove: vi.fn(),
  };

  const mockCacheService = {
    del: vi.fn().mockResolvedValue(true),
    invalidateByTags: vi.fn().mockResolvedValue(0),
  };

  const mockNotificationsPublisherService = {
    publishBrandRefresh: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [
        {
          provide: AssetsService,
          useValue: mockAssetsService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockNotificationsPublisherService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssetsController>(AssetsController);
    service = module.get<AssetsService>(AssetsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated assets', async () => {
      const mockData = {
        docs: [mockAsset],
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      mockAssetsService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAll(mockUser, {}, mockRequest);

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return empty result when no assets found', async () => {
      const mockData = {
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      };

      mockAssetsService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAll(mockUser, {}, mockRequest);

      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return an asset by id', async () => {
      mockAssetsService.findOne.mockResolvedValue(mockAsset);

      const result = await controller.findOne(
        mockRequest,
        mockAssetId.toString(),
        mockUser,
      );

      expect(service.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when asset does not exist', async () => {
      mockAssetsService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(mockRequest, mockAssetId.toString(), mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw HttpException for invalid ObjectId', async () => {
      await expect(
        controller.findOne(mockRequest, 'invalid-id', mockUser),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('update', () => {
    it('should update an asset', async () => {
      const updateDto: UpdateAssetDto = {
        category: AssetCategory.BANNER,
      };

      mockAssetsService.findOne.mockResolvedValue(mockAsset);
      mockAssetsService.patch.mockResolvedValue({
        ...mockAsset,
        category: AssetCategory.BANNER,
      });

      const result = await controller.update(
        mockRequest,
        mockAssetId.toString(),
        mockUser,
        updateDto,
      );

      expect(service.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when asset does not exist', async () => {
      const updateDto: UpdateAssetDto = {
        category: AssetCategory.BANNER,
      };

      mockAssetsService.findOne.mockResolvedValue(null);

      await expect(
        controller.update(
          mockRequest,
          mockAssetId.toString(),
          mockUser,
          updateDto,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should invalidate cache when setting logo or banner', async () => {
      const updateDto: UpdateAssetDto = {
        category: AssetCategory.LOGO,
        parent: mockBrandId,
        parentModel: AssetParent.BRAND,
      };

      const updatedAsset = {
        ...mockAsset,
        category: AssetCategory.LOGO,
        parent: mockBrandId,
      };

      mockAssetsService.findOne.mockResolvedValue(mockAsset);
      mockAssetsService.patchAll.mockResolvedValue({ modifiedCount: 1 });
      mockAssetsService.patch.mockResolvedValue(updatedAsset);

      await controller.update(
        mockRequest,
        mockAssetId.toString(),
        mockUser,
        updateDto,
      );

      expect(mockCacheService.invalidateByTags).toHaveBeenCalledWith([
        'brands',
        'links',
        'assets',
        'public',
      ]);
    });
  });

  describe('remove', () => {
    it('should soft delete an asset', async () => {
      mockAssetsService.findOne.mockResolvedValue(mockAsset);
      mockAssetsService.remove.mockResolvedValue({
        ...mockAsset,
        isDeleted: true,
      });

      const result = await controller.remove(
        mockRequest,
        mockAssetId.toString(),
        mockUser,
      );

      expect(service.remove).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when asset does not exist', async () => {
      mockAssetsService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockAssetId.toString(), mockUser),
      ).rejects.toThrow(HttpException);
    });
  });
});
