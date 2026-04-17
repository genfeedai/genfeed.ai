import { ContextBase } from '@api/collections/contexts/schemas/context-base.schema';
import { ContextEntry } from '@api/collections/contexts/schemas/context-entry.schema';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { Post } from '@api/collections/posts/schemas/post.schema';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock OpenAI
vi.mock('openai', () => {
  return {
    __esModule: true,
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
      embeddings: {
        create: vi.fn(),
      },
    })),
  };
});

describe('ContextsService', () => {
  let service: ContextsService;

  const mockConfigService = {
    get: vi.fn().mockReturnValue('test-api-key'),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockSave = vi.fn().mockResolvedValue(undefined);
  const mockToObject = vi.fn().mockReturnValue({ _id: 'context-123' });

  class MockContextBaseModelClass {
    _id = 'context-123';
    save = mockSave;
    toObject = mockToObject;
    static countDocuments = vi.fn();
    static create = vi.fn();
    static find = vi.fn();
    static findById = vi.fn();
    static findByIdAndDelete = vi.fn();
    static findByIdAndUpdate = vi.fn();
    static findOne = vi.fn();
    static updateOne = vi.fn();
  }

  const MockContextBaseModel =
    MockContextBaseModelClass as unknown as typeof MockContextBaseModelClass & {
      countDocuments: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      find: ReturnType<typeof vi.fn>;
      findById: ReturnType<typeof vi.fn>;
      findByIdAndDelete: ReturnType<typeof vi.fn>;
      findByIdAndUpdate: ReturnType<typeof vi.fn>;
      findOne: ReturnType<typeof vi.fn>;
      updateOne: ReturnType<typeof vi.fn>;
    };

  const mockContextBaseModel = MockContextBaseModel;

  const mockContextEntryModel = {
    countDocuments: vi.fn(),
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndDelete: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextsService,
        { provide: PrismaService, useValue: mockContextBaseModel },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ModelsService,
          useValue: {
            getOneByKey: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ReplicateService,
          useValue: { generateEmbedding: vi.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<ContextsService>(ContextsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new context base', async () => {
      const dto = {
        description: 'Test description',
        label: 'Test Context',
        type: 'project',
      };
      const organizationId = 'org-123';
      const userId = 'user-123';

      const result = await service.create(dto, organizationId, userId);

      expect(mockSave).toHaveBeenCalled();
      expect(mockLoggerService.debug).toHaveBeenCalledWith(
        'Creating context base',
        expect.any(Object),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should find all context bases for organization', async () => {
      const docs = [{ _id: 'ctx-1' }, { _id: 'ctx-2' }];
      mockContextBaseModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(docs),
        }),
      });

      const result = await service.findAll('org-123');
      expect(result).toEqual(docs);
      expect(mockContextBaseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          organization: 'org-123',
        }),
      );
    });

    it('should filter by category when provided', async () => {
      mockContextBaseModel.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([]),
        }),
      });

      await service.findAll('org-123', { category: 'brand' });
      expect(mockContextBaseModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'brand' }),
      );
    });
  });

  describe('findOne', () => {
    it('should return context base when found', async () => {
      const doc = { _id: 'ctx-1', label: 'Found' };
      mockContextBaseModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(doc),
      });

      const result = await service.findOne('ctx-1', 'org-123');
      expect(result).toEqual(doc);
    });

    it('should throw NotFoundException when context base not found', async () => {
      mockContextBaseModel.findOne.mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      await expect(service.findOne('missing', 'org-123')).rejects.toThrow(
        'Context base not found',
      );
    });
  });

  describe('remove', () => {
    it('should soft delete context base and its entries', async () => {
      mockContextBaseModel.updateOne.mockResolvedValue({ matchedCount: 1 });
      mockContextEntryModel.updateMany = vi
        .fn()
        .mockResolvedValue({ modifiedCount: 3 });

      await service.remove('ctx-1', 'org-123');

      expect(mockContextBaseModel.updateOne).toHaveBeenCalledWith(
        { _id: 'ctx-1', isDeleted: false, organization: 'org-123' },
        { $set: { isDeleted: true } },
      );
    });

    it('should throw NotFoundException when removing non-existent context', async () => {
      mockContextBaseModel.updateOne.mockResolvedValue({ matchedCount: 0 });

      await expect(service.remove('missing', 'org-123')).rejects.toThrow(
        'Context base not found',
      );
    });
  });
});
