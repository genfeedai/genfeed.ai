import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { UpdateBrandAgentConfigDto } from '@api/collections/brands/dto/update-brand-agent-config.dto';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import { BrandSerializer } from '@genfeedai/serializers';
import type { Request } from 'express';

describe('BrandsAgentConfigController agent-config endpoint', () => {
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
    id: '507f191e810c19729de860ee'.toString(),
    isDeleted: false,
    label: 'Test Brand',
    slug: 'test-handle',
  };

  let mockBrandsService: { updateAgentConfig: ReturnType<typeof vi.fn> };
  let mockIngredientsService: { findAvatarImageById: ReturnType<typeof vi.fn> };
  let controller: BrandsAgentConfigController;

  beforeEach(() => {
    mockBrandsService = {
      updateAgentConfig: vi.fn(),
    };

    mockIngredientsService = {
      findAvatarImageById: vi.fn().mockResolvedValue({ _id: 'avatar-1' }),
    };

    controller = new BrandsAgentConfigController(
      mockBrandsService as unknown as BrandsService,
      mockIngredientsService as never,
      {} as never,
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
      mockBrand.id,
      validDto,
    );
    expect(mockBrandsService.updateAgentConfig).toHaveBeenCalledWith(
      mockBrand.id,
      orgId,
      validDto,
    );
  });

  it('returns serialized data', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    const result = await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand.id,
      validDto,
    );
    expect(result).toHaveProperty('data');
  });

  it('calls BrandSerializer.serialize', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand.id,
      validDto,
    );
    expect(BrandSerializer.serialize).toHaveBeenCalled();
  });

  it('passes the brand result to the serializer', async () => {
    mockBrandsService.updateAgentConfig.mockResolvedValue(mockBrand as never);
    await controller.updateAgentConfig(
      mockRequest,
      mockUser,
      mockBrand.id,
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
        mockBrand.id,
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
      mockBrand.id,
      minimalDto,
    );
    expect(result).toHaveProperty('data');
  });

  it('rejects invalid avatar defaults before updating the brand', async () => {
    mockIngredientsService.findAvatarImageById.mockResolvedValueOnce(null);

    await expect(
      controller.updateAgentConfig(mockRequest, mockUser, mockBrand.id, {
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
      mockBrand.id,
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
