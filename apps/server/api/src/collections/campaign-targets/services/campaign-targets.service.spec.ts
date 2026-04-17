import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type CampaignTarget } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('CampaignTargetsService', () => {
  let service: CampaignTargetsService;
  let model: ReturnType<typeof createMockModel>;

  const mockTarget = {
    _id: 'test-object-id',
    campaign: 'test-object-id',
    isDeleted: false,
    status: 'pending',
  };

  beforeEach(async () => {
    const mockModel: any = vi.fn().mockImplementation((dto) => ({
      ...dto,
      save: vi.fn().mockResolvedValue({ ...mockTarget, ...dto }),
    }));
    mockModel.aggregate = vi.fn();
    mockModel.aggregatePaginate = vi.fn();
    mockModel.find = vi
      .fn()
      .mockReturnValue({ exec: vi.fn().mockResolvedValue([mockTarget]) });
    mockModel.findById = vi
      .fn()
      .mockReturnValue({ exec: vi.fn().mockResolvedValue(mockTarget) });
    mockModel.findByIdAndDelete = vi.fn();
    mockModel.findByIdAndUpdate = vi.fn();
    mockModel.findOne = vi.fn();
    mockModel.insertMany = vi.fn().mockResolvedValue([mockTarget]);
    mockModel.updateMany = vi.fn();
    mockModel.deleteMany = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignTargetsService,
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

    service = module.get<CampaignTargetsService>(CampaignTargetsService);
    model = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMany', () => {
    it('should insert multiple targets', async () => {
      const targets = [{ campaign: 'test-object-id' }] as any[];
      const result = await service.createMany(targets);
      expect(model.insertMany).toHaveBeenCalledWith(targets);
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should find target by id', async () => {
      const _result = await service.findById(mockTarget._id.toString());
      expect(model.findById).toHaveBeenCalledWith(mockTarget._id.toString());
    });
  });

  describe('findByCampaign', () => {
    it('should find targets by campaign id', async () => {
      const _result = await service.findByCampaign(
        mockTarget.campaign.toString(),
      );
      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });

  describe('findByCampaignAndStatus', () => {
    it('should find targets by campaign and status', async () => {
      await service.findByCampaignAndStatus(
        mockTarget.campaign.toString(),
        'pending' as any,
      );
      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false, status: 'pending' }),
      );
    });
  });
});
