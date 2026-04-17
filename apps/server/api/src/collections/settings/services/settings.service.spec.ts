import { Setting } from '@api/collections/settings/schemas/setting.schema';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockModel: ReturnType<typeof createMockModel>;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    mockModel = createMockModel({
      theme: 'dark',
      user: new Types.ObjectId(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getModelToken(Setting.name, DB_CONNECTIONS.AUTH),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new setting document', async () => {
      const dto = { language: 'en', theme: 'light' };
      const result = await service.create(dto as never);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('_id');
    });
  });

  describe('findOne', () => {
    it('should find a setting by filter', async () => {
      const settingsId = new Types.ObjectId();
      const settingsDoc = { _id: settingsId, theme: 'dark' };
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(settingsDoc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: settingsId.toString() });

      expect(result).toEqual(settingsDoc);
      expect(mockModel.findOne).toHaveBeenCalled();
    });

    it('should return null when setting not found', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({
        _id: new Types.ObjectId().toString(),
      });

      expect(result).toBeNull();
    });
  });

  describe('patch', () => {
    it('should update a setting and return updated document', async () => {
      const settingsId = new Types.ObjectId();
      const updatedDoc = { _id: settingsId, theme: 'light' };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedDoc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(settingsId, {
        theme: 'light',
      } as never);

      expect(result).toEqual(updatedDoc);
      expect(mockModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('should return null when setting not found for update', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.patch(new Types.ObjectId(), {
        theme: 'x',
      } as never);

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should soft delete a setting', async () => {
      const settingsId = new Types.ObjectId().toString();
      const deletedDoc = { _id: settingsId, isDeleted: true };
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(deletedDoc),
      });

      const result = await service.remove(settingsId);

      expect(result).toEqual(deletedDoc);
    });

    it('should return null when setting not found for deletion', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      const result = await service.remove('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated settings via aggregation', async () => {
      const aggResult = {
        docs: [{ _id: new Types.ObjectId(), theme: 'dark' }],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };
      mockModel.aggregatePaginate.mockResolvedValue(aggResult);
      mockModel.aggregate.mockReturnValue([]);

      const result = await service.findAll([{ $match: { isDeleted: false } }], {
        limit: 10,
        page: 1,
      });

      expect(result).toEqual(aggResult);
      expect(result.totalDocs).toBe(1);
    });
  });

  describe('processSearchParams', () => {
    it('should convert string IDs to ObjectId for known fields', () => {
      const stringId = new Types.ObjectId().toString();
      const processed = service.processSearchParams({
        _id: stringId,
        user: stringId,
      });

      expect(processed._id).toBeInstanceOf(Types.ObjectId);
      expect(processed.user).toBeInstanceOf(Types.ObjectId);
    });

    it('should not convert non-ObjectId fields', () => {
      const processed = service.processSearchParams({
        language: 'en',
        theme: 'dark',
      });

      expect(processed.theme).toBe('dark');
      expect(processed.language).toBe('en');
    });
  });
});
