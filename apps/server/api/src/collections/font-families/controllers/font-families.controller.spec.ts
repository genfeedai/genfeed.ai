vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

import { FontFamiliesController } from '@api/collections/font-families/controllers/font-families.controller';
import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import { FontFamiliesService } from '@api/collections/font-families/services/font-families.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
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
      .overrideGuard(ClerkGuard)
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

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with organization filter', () => {
      const query = {};
      const pipeline = controller.buildFindAllPipeline(mockUser, query, false);

      expect(pipeline).toBeDefined();
      expect(Array.isArray(pipeline)).toBe(true);
    });

    it('should load defaults when no organization', () => {
      const userWithoutOrg: User = {
        publicMetadata: {
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;

      const query = {};
      const pipeline = controller.buildFindAllPipeline(
        userWithoutOrg,
        query,
        false,
      );

      expect(pipeline).toBeDefined();
    });
  });
});
