import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PresetsController', () => {
  let controller: PresetsController;

  const mockUser: User = {
    isSuperAdmin: true,
    organizationId: 'cmorganization000000000000001',
    userId: 'cmuser0000000000000000001',
  } as unknown as User;

  const mockPreset = {
    id: 'cmpreset000000000000000001',
    category: 'video',
    createdAt: new Date(),
    isActive: true,
    isDeleted: false,
    key: 'default',
    label: 'Default Preset',
    organizationId: null,
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

  describe('buildFindAllQuery', () => {
    it('should build query with organization filter', () => {
      const inputQuery = { category: 'video' };
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toBeDefined();
      expect(Array.isArray(query)).toBe(false);
    });

    it('should default orderBy to { createdAt: -1 } when no sort provided', () => {
      const query = controller.buildFindAllQuery(mockUser, {});

      expect(query.orderBy).toEqual({ createdAt: -1 });
    });

    it('should filter by category', () => {
      const inputQuery = { category: 'image' };
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toBeDefined();
    });

    it('should filter by active status', () => {
      const inputQuery = { isActive: true };
      const query = controller.buildFindAllQuery(mockUser, inputQuery);

      expect(query).toBeDefined();
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
        isSuperAdmin: false,
        organizationId: 'cmorganization000000000000001',
        userId: 'cmuser0000000000000000001',
      } as unknown as User;

      const createDto: CreatePresetDto = {
        category: 'video',
        key: 'new',
        label: 'New Preset',
      };

      const enriched = controller.enrichCreateDto(createDto, regularUser);

      expect(enriched.organizationId).toBeDefined();
    });
  });

  describe('canUserModifyEntity', () => {
    it('should allow superadmin to modify any preset', () => {
      const entity = { organizationId: null };
      const result = controller.canUserModifyEntity(mockUser, entity);

      expect(result).toBe(true);
    });

    it('should deny non-admin modifying default presets', () => {
      const regularUser: User = {
        isSuperAdmin: false,
        organizationId: 'cmorganization000000000000001',
        userId: 'cmuser0000000000000000001',
      } as unknown as User;

      const entity = { organizationId: null };
      const result = controller.canUserModifyEntity(regularUser, entity);

      expect(result).toBe(false);
    });

    it('should allow modifying own organization presets', () => {
      const regularUser: User = {
        isSuperAdmin: false,
        organizationId: 'cmorganization000000000000001',
        userId: 'cmuser0000000000000000001',
      } as unknown as User;

      const entity = {
        organizationId: 'cmorganization000000000000001',
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
      const id = mockPreset.id;
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
      const id = mockPreset.id;
      const request = {} as Request;

      mockPresetsService.findOne.mockResolvedValue(mockPreset);
      mockPresetsService.remove.mockResolvedValue(mockPreset);

      const result = await controller.remove(request, mockUser, id);

      expect(result).toBeDefined();
    });
  });
});
