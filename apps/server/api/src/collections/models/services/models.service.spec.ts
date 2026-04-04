import { ModelsService } from '@api/collections/models/services/models.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('ModelsService', () => {
  let service: ModelsService;
  let mockModel: Record<string, ReturnType<typeof vi.fn>>;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn().mockResolvedValue([]),
      aggregatePaginate: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
      countDocuments: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
      }),
      findById: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        lean: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
      }),
      findOne: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        lean: vi
          .fn()
          .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
      }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    };

    service = new ModelsService(
      mockModel as never,
      mockLoggerService as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('updateMany calls model.updateMany with filter and update', async () => {
    await service.updateMany(
      { category: 'image' },
      { $set: { isActive: false } },
    );
    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { category: 'image' },
      { $set: { isActive: false } },
    );
  });

  it('count calls model.countDocuments', async () => {
    mockModel.countDocuments.mockResolvedValue(5);
    const result = await service.count({ isDeleted: false });
    expect(result).toBe(5);
    expect(mockModel.countDocuments).toHaveBeenCalledWith({ isDeleted: false });
  });

  it('findAllActive queries for active non-deleted models', async () => {
    const activeModels = [{ key: 'model-1' }, { key: 'model-2' }];
    mockModel.find.mockReturnValue({
      exec: vi.fn().mockResolvedValue(activeModels),
      lean: vi.fn(),
    });
    const result = await service.findAllActive();
    expect(result).toEqual(activeModels);
    expect(mockModel.find).toHaveBeenCalledWith({
      isActive: true,
      isDeleted: false,
    });
  });

  it('count returns 0 for empty collection', async () => {
    mockModel.countDocuments.mockResolvedValue(0);
    const result = await service.count({});
    expect(result).toBe(0);
  });

  it('updateMany returns void', async () => {
    const result = await service.updateMany({}, { $set: { isActive: true } });
    expect(result).toBeUndefined();
  });

  it('findAllActive returns empty array when no active models', async () => {
    mockModel.find.mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    });
    const result = await service.findAllActive();
    expect(result).toEqual([]);
  });

  it('count with specific filter', async () => {
    mockModel.countDocuments.mockResolvedValue(3);
    const result = await service.count({ category: 'video', isDeleted: false });
    expect(result).toBe(3);
  });

  it('updateMany with complex update query', async () => {
    await service.updateMany(
      { isDeleted: true },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
    expect(mockModel.updateMany).toHaveBeenCalled();
  });
});
