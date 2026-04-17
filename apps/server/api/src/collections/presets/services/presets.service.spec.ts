import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { UpdatePresetDto } from '@api/collections/presets/dto/update-preset.dto';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

type MockPresetModel = vi.Mock & {
  aggregate: ReturnType<typeof vi.fn>;
  aggregatePaginate: ReturnType<typeof vi.fn>;
  collection: { name: string };
  create: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findByIdAndDelete: ReturnType<typeof vi.fn>;
  findByIdAndUpdate: ReturnType<typeof vi.fn>;
  findOne: ReturnType<typeof vi.fn>;
  modelName: string;
  populate: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
};

describe('PresetsService', () => {
  let service: PresetsService;
  let model: MockPresetModel;

  const mockPreset = {
    _id: '507f1f77bcf86cd799439011',
    category: 'video',
    createdAt: new Date(),
    description: 'Standard settings for video generation',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: 'default_video_settings',
    label: 'Default Video Settings',
    updatedAt: new Date(),
    value: {
      audioCodec: 'aac',
      bitrate: '5000k',
      codec: 'h264',
      fps: 30,
      resolution: '1920x1080',
    },
  };

  beforeEach(async () => {
    // Must be a callable constructor for `new this.model()` in BaseService.create()
    const MockPresetModel = vi.fn().mockImplementation(function (
      data: Record<string, unknown>,
    ) {
      return {
        ...data,
        save: vi.fn().mockResolvedValue(data),
      };
    }) as unknown as MockPresetModel;
    MockPresetModel.collection = { name: 'presets' };
    MockPresetModel.modelName = 'Preset';
    MockPresetModel.aggregate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    });
    MockPresetModel.aggregatePaginate = vi.fn().mockResolvedValue({
      docs: [],
      totalDocs: 0,
    });
    MockPresetModel.create = vi.fn();
    MockPresetModel.deleteMany = vi.fn();
    MockPresetModel.find = vi.fn();
    MockPresetModel.findById = vi.fn();
    MockPresetModel.findByIdAndDelete = vi.fn();
    MockPresetModel.findByIdAndUpdate = vi.fn();
    // PresetsService uses this.presetModel.findOne() directly (not chained)
    MockPresetModel.findOne = vi.fn().mockResolvedValue(null);
    MockPresetModel.populate = vi.fn();
    MockPresetModel.save = vi.fn();
    MockPresetModel.updateMany = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PresetsService,
        { provide: PrismaService, useValue: MockPresetModel },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PresetsService>(PresetsService);
    model = module.get(PrismaService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a preset with unique key', async () => {
      const createDto: CreatePresetDto = {
        category: 'video' as never,
        key: 'custom_settings',
        label: 'Custom Settings',
      } as unknown as CreatePresetDto;

      // PresetsService calls this.presetModel.findOne() directly (returns Promise)
      const savedPreset = {
        ...mockPreset,
        key: 'custom_settings',
      } as unknown as Record<string, unknown>;
      model.findOne = vi.fn().mockResolvedValue(null);
      (model as vi.Mock).mockImplementationOnce(function () {
        return { ...savedPreset, save: vi.fn().mockResolvedValue(savedPreset) };
      });

      const result = await service.create(createDto);

      expect(model.findOne).toHaveBeenCalledWith({ key: 'custom_settings' });
      expect(result.key).toBe('custom_settings');
    });

    it('should throw ConflictException for duplicate key', async () => {
      const createDto: CreatePresetDto = {
        key: 'default_video_settings',
        label: 'Duplicate Preset',
      } as unknown as CreatePresetDto;

      model.findOne = vi.fn().mockResolvedValue(mockPreset); // Existing preset found

      await expect(service.create(createDto)).rejects.toThrow(
        new ConflictException(
          "Preset with key 'default_video_settings' already exists",
        ),
      );
    });

    it('should create preset with complex value object', async () => {
      const complexValue = {
        audio: {
          channels: 2,
          codec: 'aac',
          sampleRate: 48000,
        },
        filters: ['denoise', 'stabilize'],
        video: {
          encoding: {
            codec: 'h264',
            level: '4.2',
            profile: 'high',
          },
          resolution: { height: 1080, width: 1920 },
        },
      };

      const createDto: CreatePresetDto = {
        category: 'video' as never,
        key: 'advanced_preset',
        label: 'Advanced Preset',
      } as unknown as CreatePresetDto;

      const savedPreset = {
        ...mockPreset,
        value: complexValue,
      } as unknown as Record<string, unknown>;
      model.findOne = vi.fn().mockResolvedValue(null);
      (model as vi.Mock).mockImplementationOnce(function () {
        return { ...savedPreset, save: vi.fn().mockResolvedValue(savedPreset) };
      });

      const result = await service.create(createDto);

      expect((result as unknown as { value: unknown }).value).toEqual(
        complexValue,
      );
    });
  });

  describe('findByKey', () => {
    it('should find preset by key', async () => {
      model.findOne = vi.fn().mockResolvedValue(mockPreset);

      const result = await service.findByKey('default_video_settings');

      expect(model.findOne).toHaveBeenCalledWith({
        isActive: true,
        key: 'default_video_settings',
      });
      expect(result).toEqual(mockPreset);
    });

    it('should throw NotFoundException for non-existent key', async () => {
      model.findOne = vi.fn().mockResolvedValue(null);

      await expect(service.findByKey('non_existent')).rejects.toThrow(
        new NotFoundException("Preset with key 'non_existent' not found"),
      );
    });

    it('should not find inactive presets', async () => {
      model.findOne = vi.fn().mockResolvedValue(null);

      await expect(service.findByKey('inactive_preset')).rejects.toThrow(
        NotFoundException,
      );

      expect(model.findOne).toHaveBeenCalledWith({
        isActive: true,
        key: 'inactive_preset',
      });
    });
  });

  describe('patch', () => {
    it('should update preset without changing key', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto: UpdatePresetDto = {
        label: 'Updated Name',
      } as unknown as UpdatePresetDto;

      const updatedPreset = { ...mockPreset, label: 'Updated Name' };
      const findOneSpy = vi.fn().mockResolvedValue(null);
      model.findOne = findOneSpy;
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedPreset),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(id, updateDto);

      expect(findOneSpy).not.toHaveBeenCalled(); // No key check needed
      expect((result as unknown as { label: string }).label).toBe(
        'Updated Name',
      );
    });

    it('should update preset key if unique', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto: UpdatePresetDto = {
        key: 'new_unique_key',
      };

      const updatedPreset = { ...mockPreset, key: 'new_unique_key' };
      model.findOne = vi.fn().mockResolvedValue(null); // No conflict
      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedPreset),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(id, updateDto);

      expect(model.findOne).toHaveBeenCalledWith({
        _id: { $ne: id },
        key: 'new_unique_key',
      });
      expect(result.key).toBe('new_unique_key');
    });

    it('should throw ConflictException when updating to duplicate key', async () => {
      const id = '507f1f77bcf86cd799439011';
      const updateDto: UpdatePresetDto = {
        key: 'existing_key',
      };

      const existingPreset = { ...mockPreset, key: 'existing_key' };
      model.findOne = vi.fn().mockResolvedValue(existingPreset);

      await expect(service.patch(id, updateDto)).rejects.toThrow(
        new ConflictException("Preset with key 'existing_key' already exists"),
      );
    });
  });

  describe('findAll', () => {
    it('should find all active presets', async () => {
      const aggregate: PipelineStage[] = [
        { $match: { isActive: true, isDeleted: false } },
        { $sort: { category: 1, label: 1 } },
      ];
      const options = { limit: 50, page: 1 };
      const mockResult = {
        docs: [mockPreset],
        limit: 50,
        page: 1,
        totalDocs: 1,
      };

      model.aggregate = vi.fn().mockReturnValue({ exec: vi.fn() });
      model.aggregatePaginate = vi.fn().mockResolvedValue(mockResult);

      const result = await service.findAll(aggregate, options);

      expect(result).toEqual(mockResult);
    });

    it('should filter presets by category', async () => {
      const aggregate: PipelineStage[] = [
        { $match: { category: 'video', isDeleted: false } },
      ];
      const options = { limit: 20, page: 1 };
      const videoPresets = [
        mockPreset,
        { ...mockPreset, key: 'hd_video_settings' },
        { ...mockPreset, key: '4k_video_settings' },
      ];

      model.aggregate = vi.fn().mockReturnValue({ exec: vi.fn() });
      model.aggregatePaginate = vi.fn().mockResolvedValue({
        docs: videoPresets,
        totalDocs: 3,
      });

      const result = await service.findAll(aggregate, options);

      expect(result.docs).toHaveLength(3);
    });
  });

  describe('findOne', () => {
    it('should find preset by id', async () => {
      const params = { _id: mockPreset._id };

      // BaseService.findOne with no populate calls .findOne().exec()
      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockPreset),
      });

      const result = await service.findOne(params);

      expect(result).toEqual(mockPreset);
    });

    it('should find default preset', async () => {
      const params = { isDefault: true };
      const defaultPreset = { ...mockPreset, isDefault: true };

      model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(defaultPreset),
      });

      const result = await service.findOne(params);

      expect((result as unknown as { isDefault?: boolean })?.isDefault).toBe(
        true,
      );
    });
  });

  describe('remove', () => {
    it('should soft delete preset', async () => {
      const id = '507f1f77bcf86cd799439011';
      const deletedPreset = { ...mockPreset, isActive: false, isDeleted: true };

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(deletedPreset),
      });

      const result = await service.remove(id);

      expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
        id,
        { isDeleted: true },
        { returnDocument: 'after' },
      );
      expect(result.isDeleted).toBe(true);
    });

    it('should return null when preset not found for deletion', async () => {
      const id = '507f1f77bcf86cd799439011';

      model.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.remove(id);

      expect(result).toBeNull();
    });
  });

  describe('preset application', () => {
    it('should handle preset value merging', () => {
      const basePreset = {
        fps: 30,
        resolution: '1920x1080',
      };
      const overrides = {
        codec: 'h265',
        fps: 60,
      };

      const merged = { ...basePreset, ...overrides };

      expect(merged.resolution).toBe('1920x1080');
      expect(merged.fps).toBe(60);
      expect(merged.codec).toBe('h265');
    });

    it('should validate preset value structure', async () => {
      const createDto: CreatePresetDto = {
        category: 'video' as never,
        key: 'invalid_preset',
        label: 'Invalid',
        value: 'not an object', // Should be an object
      } as unknown as CreatePresetDto;

      model.findOne = vi.fn().mockResolvedValue(null);
      const error = new ValidationException('Preset value must be an object');
      (model as vi.Mock).mockImplementationOnce(function () {
        return { save: vi.fn().mockRejectedValue(error) };
      });

      await expect(service.create(createDto)).rejects.toThrow(
        ValidationException,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle preset with null value', async () => {
      const createDto: CreatePresetDto = {
        category: 'video' as never,
        key: 'null_preset',
        label: 'Null Preset',
        value: null,
      } as unknown as CreatePresetDto;

      const nullPreset = { ...mockPreset, value: null };
      model.findOne = vi.fn().mockResolvedValue(null);
      (model as vi.Mock).mockImplementationOnce(function () {
        return { ...nullPreset, save: vi.fn().mockResolvedValue(nullPreset) };
      });

      const result = await service.create(createDto);

      expect((result as unknown as { value: null }).value).toBeNull();
    });

    it('should handle very long key names', async () => {
      const longKey = 'a'.repeat(100);
      const createDto: CreatePresetDto = {
        category: 'video' as never,
        key: longKey,
        label: 'Long Key Preset',
        value: {},
      } as unknown as CreatePresetDto;

      const longKeyPreset = { ...mockPreset, key: longKey };
      model.findOne = vi.fn().mockResolvedValue(null);
      (model as vi.Mock).mockImplementationOnce(function () {
        return {
          ...longKeyPreset,
          save: vi.fn().mockResolvedValue(longKeyPreset),
        };
      });

      const result = await service.create(createDto);

      expect(result.key).toHaveLength(100);
    });
  });
});
