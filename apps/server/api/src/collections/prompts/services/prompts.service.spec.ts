import { Prompt } from '@api/collections/prompts/schemas/prompt.schema';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

function createMockModel() {
  const savedDoc = {
    _id: 'test-object-id',
    category: 'presets-description-image',
    original: 'test prompt',
  };

  const mockModelFn = vi.fn().mockImplementation(function () {
    return {
      save: vi.fn().mockResolvedValue(savedDoc),
    };
  });

  mockModelFn.collection = { name: 'prompts' };
  mockModelFn.modelName = 'Prompt';
  mockModelFn.aggregate = vi.fn();
  mockModelFn.aggregatePaginate = vi.fn();
  mockModelFn.find = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue([]),
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  });
  mockModelFn.findById = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(savedDoc),
    populate: vi.fn().mockReturnThis(),
  });
  mockModelFn.findByIdAndUpdate = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(savedDoc),
    populate: vi.fn().mockReturnThis(),
  });
  mockModelFn.findOne = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue(savedDoc),
    populate: vi.fn().mockReturnThis(),
  });
  mockModelFn.updateMany = vi.fn().mockReturnValue({
    exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
  });

  return { mockModelFn, savedDoc };
}

describe('PromptsService', () => {
  let service: PromptsService;
  let mockModelFn: ReturnType<typeof createMockModel>['mockModelFn'];
  let savedDoc: ReturnType<typeof createMockModel>['savedDoc'];

  beforeEach(async () => {
    const mock = createMockModel();
    mockModelFn = mock.mockModelFn;
    savedDoc = mock.savedDoc;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptsService,
        { provide: PrismaService, useValue: mockModelFn },
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

    service = module.get<PromptsService>(PromptsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a prompt document', async () => {
      const dto = {
        category: 'presets-description-image' as const,
        original: 'A beautiful sunset over the ocean',
      };

      const result = await service.create(dto as never);

      expect(result).toBeDefined();
      expect(mockModelFn).toHaveBeenCalledWith(
        expect.objectContaining({
          original: 'A beautiful sunset over the ocean',
        }),
      );
    });

    it('should call save on the new document', async () => {
      const dto = {
        category: 'presets-description-image' as const,
        original: 'test',
      };

      await service.create(dto as never);

      const constructedDoc = mockModelFn.mock.results[0].value;
      expect(constructedDoc.save).toHaveBeenCalled();
    });

    it('should pass populate array to findById when provided', async () => {
      const dto = {
        category: 'presets-description-image' as const,
        original: 'test',
      };

      await service.create(dto as never, ['organization']);

      expect(mockModelFn.findById).toHaveBeenCalledWith(savedDoc._id);
    });

    it('should throw when createDto is falsy', async () => {
      await expect(service.create(null as never)).rejects.toThrow();
    });
  });

  describe('findOne', () => {
    it('should find a prompt by filter', async () => {
      const result = await service.findOne({ original: 'test prompt' });

      expect(mockModelFn.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return null when not found', async () => {
      mockModelFn.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ original: 'nonexistent' });

      expect(result).toBeNull();
    });

    it('should support populate option', async () => {
      await service.findOne({ _id: 'some-id' }, ['organization']);

      const findOneReturn = mockModelFn.findOne.mock.results[0].value;
      expect(findOneReturn.populate).toHaveBeenCalled();
    });

    it('should throw when params is invalid', async () => {
      await expect(service.findOne(null as never)).rejects.toThrow();
    });
  });
});
