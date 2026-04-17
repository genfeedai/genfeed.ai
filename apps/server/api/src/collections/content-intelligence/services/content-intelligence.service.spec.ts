import { CreatorAnalysis } from '@api/collections/content-intelligence/schemas/creator-analysis.schema';
import { ContentIntelligenceService } from '@api/collections/content-intelligence/services/content-intelligence.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('ContentIntelligenceService', () => {
  let service: ContentIntelligenceService;
  let _model: ReturnType<typeof createMockModel>;

  const mockCreator = {
    _id: new Types.ObjectId(),
    handle: 'testcreator',
    isDeleted: false,
    organization: new Types.ObjectId(),
    platform: 'twitter',
    status: 'pending',
  };

  beforeEach(async () => {
    const mockModel: any = vi.fn().mockImplementation((dto) => ({
      ...dto,
      save: vi.fn().mockResolvedValue({ ...mockCreator, ...dto }),
    }));
    mockModel.aggregate = vi.fn();
    mockModel.aggregatePaginate = vi.fn();
    mockModel.find = vi.fn();
    mockModel.findById = vi.fn();
    mockModel.findByIdAndDelete = vi.fn();
    mockModel.findByIdAndUpdate = vi.fn();
    mockModel.findOne = vi.fn();
    mockModel.updateMany = vi.fn();
    mockModel.deleteMany = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentIntelligenceService,
        {
          provide: getModelToken(CreatorAnalysis.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
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

    service = module.get<ContentIntelligenceService>(
      ContentIntelligenceService,
    );
    _model = module.get(
      getModelToken(CreatorAnalysis.name, DB_CONNECTIONS.CLOUD),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addCreator', () => {
    it('should create a creator with default scrape config', async () => {
      vi.spyOn(service, 'create').mockResolvedValue(mockCreator as any);
      const orgId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      const dto = { handle: 'test', platform: 'twitter' } as any;
      await service.addCreator(orgId, userId, dto);
      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({ handle: 'test', organization: orgId }),
      );
    });
  });

  describe('findByHandle', () => {
    it('should find creator by handle and platform', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(mockCreator as any);
      const orgId = new Types.ObjectId();
      await service.findByHandle(orgId, 'twitter', 'testcreator');
      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ handle: 'testcreator', platform: 'twitter' }),
      );
    });
  });
});
