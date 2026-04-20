import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PresetsController', () => {
  let controller: PresetsController;

  const mockUser: User = {
    publicMetadata: {
      isSuperAdmin: true,
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockPreset = {
    _id: '507f1f77bcf86cd799439014',
    category: 'video',
    createdAt: new Date(),
    isActive: true,
    isDeleted: false,
    key: 'default',
    label: 'Default Preset',
    organization: null,
    updatedAt: new Date(),
  };

  const mockPresetsService = {
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
      controllers: [PresetsController],
      providers: [
        {
          provide: PresetsService,
          useValue: mockPresetsService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PresetsController>(PresetsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllPipeline', () => {
    it('should build pipeline with organization filter', () => {
      const query = { category: 'video' };
      const pipeline = controller.buildFindAllPipeline(mockUser, query, false);

      expect(pipeline).toBeDefined();
      expect(Array.isArray(pipeline)).toBe(true);
    });

    it('should filter by category', () => {
      const query = { category: 'image' };
      const pipeline = controller.buildFindAllPipeline(mockUser, query, false);

      expect(pipeline).toBeDefined();
    });

    it('should filter by active status', () => {
      const query = { isActive: true };
      const pipeline = controller.buildFindAllPipeline(mockUser, query, false);

      expect(pipeline).toBeDefined();
    });
  });

  describe('enrichCreateDto', () => {
    it('should enrich create DTO for superadmin', () => {
      const createDto: CreatePresetDto = {
        category: 'video',
        key: 'new',
        label: 'New Preset',
      };

      const enriched = controller.enrichCreateDto(createDto, mockUser);

      expect(enriched).toBeDefined();
    });

    it('should add organization for non-superadmin', () => {
      const regularUser: User = {
        publicMetadata: {
          isSuperAdmin: false,
          organization: '507f1f77bcf86cd799439012',
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;

      const createDto: CreatePresetDto = {
        category: 'video',
        key: 'new',
        label: 'New Preset',
      };

      const enriched = controller.enrichCreateDto(createDto, regularUser);

      expect(enriched.organization).toBeDefined();
    });
  });

  describe('canUserModifyEntity', () => {
    it('should allow superadmin to modify any preset', () => {
      const entity = { organization: null };
      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });

    it('should deny non-admin modifying default presets', () => {
      const regularUser: User = {
        publicMetadata: {
          isSuperAdmin: false,
          organization: '507f1f77bcf86cd799439012',
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;

      const entity = { organization: null };
      const result = controller.canUserModifyEntity(regularUser, entity);

      expect(result).toBe(false);
    });

    it('should allow modifying own organization presets', () => {
      const regularUser: User = {
        publicMetadata: {
          isSuperAdmin: false,
          organization: '507f1f77bcf86cd799439012',
          user: '507f1f77bcf86cd799439011',
        },
      } as unknown as User;

      const entity = {
        organization: '507f1f77bcf86cd799439012',
      };
      const result = controller.canUserModifyEntity(regularUser, entity);

      expect(result).toBe(true);
    });
  });

  describe('create', () => {
    it('should create a preset', async () => {
      const createDto: CreatePresetDto = {
        category: 'video',
        key: 'new',
        label: 'New Preset',
      };

      const request = {} as Request;
      mockPresetsService.create.mockResolvedValue(mockPreset);

      const result = await controller.create(request, mockUser, createDto);

      expect(result).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update a preset', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdatePresetDto = {
        label: 'Updated Preset',
      };

      const request = {} as Request;
      mockPresetsService.findOne.mockResolvedValue(mockPreset);
      mockPresetsService.patch.mockResolvedValue({
        ...mockPreset,
        ...updateDto,
      });

      const result = await controller.update(request, mockUser, id, updateDto);

      expect(result).toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a preset', async () => {
      const id = '507f1f77bcf86cd799439014';
      const request = {} as Request;

      mockPresetsService.findOne.mockResolvedValue(mockPreset);
      mockPresetsService.remove.mockResolvedValue(mockPreset);

      const result = await controller.remove(request, mockUser, id);

      expect(result).toBeDefined();
    });
  });
});
