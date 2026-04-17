import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipProject } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ClipProjectsService', () => {
  let service: ClipProjectsService;

  beforeEach(async () => {
    const mockModel: any = vi.fn().mockImplementation((dto) => ({
      ...dto,
      save: vi.fn().mockResolvedValue(dto),
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
        ClipProjectsService,
        { provide: PrismaService, useValue: mockModel },
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

    service = module.get<ClipProjectsService>(ClipProjectsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
