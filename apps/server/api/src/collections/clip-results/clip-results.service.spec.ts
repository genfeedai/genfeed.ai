import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import { ClipResult } from '@api/collections/clip-results/schemas/clip-result.schema';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('ClipResultsService', () => {
  let service: ClipResultsService;
  let model: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    const mockModel: any = vi.fn().mockImplementation((dto) => ({
      ...dto,
      save: vi.fn().mockResolvedValue(dto),
    }));
    mockModel.aggregate = vi.fn();
    mockModel.aggregatePaginate = vi.fn();
    mockModel.find = vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([]) }),
    });
    mockModel.findById = vi.fn();
    mockModel.findByIdAndDelete = vi.fn();
    mockModel.findByIdAndUpdate = vi.fn();
    mockModel.findOne = vi.fn();
    mockModel.updateMany = vi.fn();
    mockModel.deleteMany = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipResultsService,
        {
          provide: getModelToken(ClipResult.name, 'clips'),
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

    service = module.get<ClipResultsService>(ClipResultsService);
    model = module.get(getModelToken(ClipResult.name, 'clips'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByProject', () => {
    it('should find results by project sorted by viralityScore', async () => {
      const projectId = '507f191e810c19729de860ee'.toString();
      await service.findByProject(projectId);
      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });

    it('should filter by project ObjectId', async () => {
      const projectId = '507f191e810c19729de860ee'.toString();
      await service.findByProject(projectId);
      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          project: projectId,
        }),
      );
    });

    it('should sort by viralityScore descending', async () => {
      const sortMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });
      model.find = vi.fn().mockReturnValue({ sort: sortMock });

      await service.findByProject('507f191e810c19729de860ee'.toString());
      expect(sortMock).toHaveBeenCalledWith({ viralityScore: -1 });
    });

    it('should return empty array when no results', async () => {
      const sortMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });
      model.find = vi.fn().mockReturnValue({ sort: sortMock });

      const result = await service.findByProject(
        '507f191e810c19729de860ee'.toString(),
      );
      expect(result).toEqual([]);
    });

    it('should return clip results ordered by virality', async () => {
      const clips = [
        { _id: 'c1', viralityScore: 90 },
        { _id: 'c2', viralityScore: 80 },
      ];
      const sortMock = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(clips),
      });
      model.find = vi.fn().mockReturnValue({ sort: sortMock });

      const result = await service.findByProject(
        '507f191e810c19729de860ee'.toString(),
      );
      expect(result).toHaveLength(2);
      expect(result[0].viralityScore).toBe(90);
    });
  });
});
