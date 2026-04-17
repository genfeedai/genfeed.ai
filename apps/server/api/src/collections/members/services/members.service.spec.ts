import { MembersService } from '@api/collections/members/services/members.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { createMockModel } from '@api/shared/testing/mock-model.factory';
import { type Member } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('MembersService', () => {
  let service: MembersService;
  let mockModel: ReturnType<typeof createMockModel>;

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    mockModel = createMockModel({
      isActive: true,
      isDeleted: false,
      organization: 'test-object-id',
      user: 'test-object-id',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have constructorName set to MembersService', () => {
    expect(service.constructorName).toBe('MembersService');
  });

  describe('find', () => {
    it('should return members matching the filter', async () => {
      const orgId = 'test-object-id';
      const members = [
        { _id: 'test-object-id', isActive: true, organization: orgId },
        { _id: 'test-object-id', isActive: true, organization: orgId },
      ];
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue(members),
      });

      const result = await service.find({ organization: orgId });

      expect(mockModel.find).toHaveBeenCalledWith({ organization: orgId });
      expect(result).toEqual(members);
    });

    it('should return empty array when no members match', async () => {
      mockModel.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.find({ organization: 'test-object-id' });

      expect(result).toEqual([]);
    });
  });

  describe('setLastUsedBrand', () => {
    it('should update lastUsedBrand for the matching member', async () => {
      const filter = {
        isActive: true,
        isDeleted: false,
        organization: 'test-object-id',
        user: 'test-object-id',
      };
      const brandId = 'test-object-id';
      mockModel.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });

      await service.setLastUsedBrand(filter, brandId);

      expect(mockModel.updateOne).toHaveBeenCalledWith(filter, {
        $set: { lastUsedBrand: brandId },
      });
    });

    it('should not throw when no member matches the filter', async () => {
      mockModel.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 0 });

      await expect(
        service.setLastUsedBrand({ user: 'test-object-id' }, 'test-object-id'),
      ).resolves.not.toThrow();
    });
  });

  describe('inherited BaseService methods', () => {
    it('should call findOne via BaseService with processed params', async () => {
      const memberId = 'test-object-id'.toString();
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: memberId }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({ _id: memberId });

      expect(mockModel.findOne).toHaveBeenCalled();
      expect(result).toEqual({ _id: memberId });
    });

    it('should return null from findOne when member not found', async () => {
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOne({
        _id: 'test-object-id'.toString(),
      });

      expect(result).toBeNull();
    });

    it('should call findAll via BaseService', async () => {
      const aggResult = {
        docs: [],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      };
      mockModel.aggregatePaginate.mockResolvedValue(aggResult);
      mockModel.aggregate.mockReturnValue([]);

      const result = await service.findAll([{ $match: { isDeleted: false } }], {
        limit: 10,
        page: 1,
      });

      expect(result).toEqual(aggResult);
    });
  });
});
