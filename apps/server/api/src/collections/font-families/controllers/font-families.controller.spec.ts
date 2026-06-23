vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FontFamiliesController } from '@api/collections/font-families/controllers/font-families.controller';
import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('FontFamiliesController', () => {
  let controller: FontFamiliesController;

  const mockUser: User = {
    publicMetadata: {
      isSuperAdmin: true,
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockFontFamily = {
    _id: '507f1f77bcf86cd799439014',
    category: 'sans-serif',
    createdAt: new Date(),
    family: 'Roboto',
    isDeleted: false,
    label: 'Roboto',
    updatedAt: new Date(),
    user: '507f1f77bcf86cd799439011',
  };

  const mockFontFamiliesService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FontFamiliesController],
      providers: [
        {
          provide: FontFamiliesService,
          useValue: mockFontFamiliesService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FontFamiliesController>(FontFamiliesController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a font family by id', async () => {
      const id = '507f1f77bcf86cd799439014';
      const request = {} as Request;

      mockFontFamiliesService.findOne.mockResolvedValue(mockFontFamily);

      const result = await controller.findOne(request, mockUser, id);

      expect(result).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create a font family', async () => {
      const createDto: CreateFontFamilyDto = {
        category: 'sans-serif',
        family: 'Roboto',
        label: 'Roboto',
      };

      const request = {} as Request;
      mockFontFamiliesService.create.mockResolvedValue(mockFontFamily);

      const result = await controller.create(request, mockUser, createDto);

      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a font family', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateFontFamilyDto = {
        label: 'Roboto Bold',
      };

      const request = {} as Request;
      const updatedFontFamily = { ...mockFontFamily, ...updateDto };
      mockFontFamiliesService.findOne.mockResolvedValue(mockFontFamily);
      mockFontFamiliesService.patch.mockResolvedValue(updatedFontFamily);

      const result = await controller.update(request, mockUser, id, updateDto);

      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a font family', async () => {
      const id = '507f1f77bcf86cd799439014';
      const request = {} as Request;

      mockFontFamiliesService.findOne.mockResolvedValue(mockFontFamily);
      mockFontFamiliesService.remove.mockResolvedValue(mockFontFamily);

      const result = await controller.remove(request, mockUser, id);

      expect(result).toBeDefined();
    });
  });

  describe('buildFindAllQuery', () => {
    it('should build query with organization filter and include global items', () => {
      const inputQuery = {};
      const query = controller.buildFindAllQuery(mockUser, inputQuery as never);

      expect(query).toBeDefined();
      expect(Array.isArray(query)).toBe(false);
      // global condition must be organization: null only (no user field)
      expect(query.where.OR).toContainEqual({ organization: null });
      // user's org condition must be present
      expect(query.where.OR).toContainEqual({
        organization: '507f1f77bcf86cd799439012',
      });
      // no { user: ... } condition — FontFamilyRecord has no user column
      expect(
        query.where.OR.some((c: Record<string, unknown>) => 'user' in c),
      ).toBe(false);
    });

    it('should return only global items when no organization', () => {
      const userWithoutOrg: User = {
        publicMetadata: {},
      } as unknown as User;

      const inputQuery = {};
      const query = controller.buildFindAllQuery(
        userWithoutOrg,
        inputQuery as never,
      );

      expect(query).toBeDefined();
      expect(query.where.OR).toEqual([{ organization: null }]);
    });

    it('should use default orderBy with label when no sort provided', () => {
      const inputQuery = {};
      const query = controller.buildFindAllQuery(mockUser, inputQuery as never);

      expect(query.orderBy).toEqual({ createdAt: -1, label: 1 });
    });
  });
});
