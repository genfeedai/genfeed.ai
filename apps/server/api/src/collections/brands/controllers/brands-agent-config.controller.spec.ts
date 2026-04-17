import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { User } from '@clerk/backend';
import { BrandSerializer } from '@genfeedai/serializers';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';

describe('BrandsController agent-config endpoint', () => {
  const orgId = '507f191e810c19729de860ee'.toString();
  const userId = '507f191e810c19729de860ee'.toString();

  const mockRequest = {
    originalUrl: '/v1/brands/brand-id/agent-config',
  } as Request;

  const mockUser = {
    id: 'user-1',
    publicMetadata: {
      organization: orgId,
      user: userId,
    },
  } as unknown as User;

  const mockBrand = {
    _id: '507f191e810c19729de860ee'.toString(),
    isDeleted: false,
    label: 'Test Brand',
    slug: 'test-handle',
  };

  let mockBrandsService: { updateAgentConfig: ReturnType<typeof vi.fn> };
  let mockIngredientsService: { findAvatarImageById: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let controller: BrandsController;

  beforeEach(() => {
    mockBrandsService = {
      updateAgentConfig: vi.fn(),
    };

    mockIngredientsService = {
      findAvatarImageById: vi.fn().mockResolvedValue({ _id: 'avatar-1' }),
    };

    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    controller = new BrandsController(
      mockRequest,
      mockBrandsService as unknown as BrandsService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mockIngredientsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      loggerService as unknown as LoggerService,
    );

    vi.clearAllMocks();
    vi.spyOn(BrandSerializer, 'serialize').mockImplementation((data) => ({
      data,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validDto: UpdateBrandAgentConfigDto = {
    autoPublish: { enabled: true },
    enabledSkills: ['content-writing'],
    schedule: { enabled: false },
    strategy: {
      contentTypes: ['thread'],
      frequency: 'daily',
      goals: ['engagement'],
      platforms: ['twitter'],
    },
    voice: {
      audience: 'founders',
      style: 'direct',
      tone: 'confident',
      values: ['clarity'],
    },
  };

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls updateAgentConfig with correct parameters', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand._id,
      validDto,
    );
    expect(mockBrandsService.updateAgentConfig).toHaveBeenCalledWith(
      mockBrand._id,
      orgId,
      validDto,
    );
  });

  it('returns serialized data', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    const result = await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand._id,
      validDto,
    );
    expect(result).toHaveProperty('data');
  });

  it('calls BrandSerializer.serialize', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand._id,
      validDto,
    );
    expect(BrandSerializer.serialize).toHaveBeenCalled();
  });

  it('passes the brand result to the serializer', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand._id,
      validDto,
    );
    expect(BrandSerializer.serialize).toHaveBeenCalledWith(mockBrand);
  });

  it('propagates service errors', async () => {
    mockBrandsService.updateAgentConfig.mockRejectedValue(
      new Error('DB error'),
    );
    await expect(
      controller.updateAgentConfig(
        mockRequest,
        mockUser,
        mockBrand._id,
        validDto,
      ),
    ).rejects.toThrow('DB error');
  });

  it('works with minimal dto', async () => {
    const minimalDto: UpdateBrandAgentConfigDto = {
      enabledSkills: [],
    } as unknown as UpdateBrandAgentConfigDto;
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    const result = await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand._id,
      minimalDto,
    );
    expect(result).toHaveProperty('data');
  });

  it('rejects invalid avatar defaults before updating the brand', async () => {
    mockIngredientsService.findAvatarImageById.mockResolvedValueOnce(null);

    await expect(
      controller.updateAgentConfig(mockRequest, mockUser, mockBrand._id, {
        defaultAvatarIngredientId: 'bad-avatar',
      } as UpdateBrandAgentConfigDto),
    ).rejects.toThrow(
      'Default avatar must reference an avatar image ingredient in this organization',
    );

    expect(mockBrandsService.updateAgentConfig).not.toHaveBeenCalled();
  });

  it('uses organization from user publicMetadata', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand._id,
      validDto,
    );
    expect(mockBrandsService.updateAgentConfig).toHaveBeenCalledWith(
      expect.anything(),
      orgId,
      expect.anything(),
    );
  });

  it('uses the brandId parameter correctly', async () => {
    const brandId = '507f191e810c19729de860ee'.toString();
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      brandId,
      validDto,
    );
    expect(mockBrandsService.updateAgentConfig).toHaveBeenCalledWith(
      brandId,
      expect.anything(),
      expect.anything(),
    );
  });
});
