import { TemplateUsage } from '@api/collections/template-usage/schemas/template-usage.schema';
import { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('TemplateUsageService', () => {
  let service: TemplateUsageService;

  beforeEach(async () => {
    const mockModel = vi.fn().mockImplementation(() => ({
      save: vi.fn(),
      toObject: vi.fn().mockReturnValue({}),
    }));
    mockModel.countDocuments = vi.fn().mockResolvedValue(0);
    mockModel.find = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
      limit: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    });
    mockModel.findByIdAndUpdate = vi
      .fn()
      .mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockModel.aggregate = vi.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplateUsageService,
        {
          provide: getModelToken(TemplateUsage.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<TemplateUsageService>(TemplateUsageService);
  });

  let mockModel: Record<string, unknown>;

  beforeEach(() => {
    mockModel = (service as unknown).templateUsageModel;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a usage record and return entity with string IDs', async () => {
      const mockId = '507f1f77bcf86cd799439011';
      const mockOrgId = '507f1f77bcf86cd799439022';
      const mockTemplateId = '507f1f77bcf86cd799439033';
      const mockObj = {
        _id: { toString: () => mockId },
        generatedContent: 'generated text',
        organization: { toString: () => mockOrgId },
        template: { toString: () => mockTemplateId },
        user: undefined,
        wasModified: false,
      };

      (mockModel as Function).mockImplementation(function () {
        return {
          save: vi.fn().mockResolvedValue(undefined),
          toObject: vi.fn().mockReturnValue(mockObj),
        };
      });

      const result = await service.create({
        generatedContent: 'generated text',
        organization: mockOrgId,
        template: mockTemplateId,
      });

      expect(result).toBeDefined();
      expect(result._id).toBe(mockId);
      expect(result.organization).toBe(mockOrgId);
      expect(result.template).toBe(mockTemplateId);
    });

    it('should include user when provided', async () => {
      const mockUserId = '507f1f77bcf86cd799439044';
      const mockOrgId2 = '507f1f77bcf86cd799439055';
      const mockTemplateId2 = '507f1f77bcf86cd799439066';
      const mockObj = {
        _id: { toString: () => 'id1' },
        organization: { toString: () => mockOrgId2 },
        template: { toString: () => mockTemplateId2 },
        user: { toString: () => mockUserId },
      };

      (mockModel as Function).mockImplementation(function () {
        return {
          save: vi.fn().mockResolvedValue(undefined),
          toObject: vi.fn().mockReturnValue(mockObj),
        };
      });

      const result = await service.create({
        generatedContent: 'text',
        organization: mockOrgId2,
        template: mockTemplateId2,
        user: mockUserId,
      });

      expect(result.user).toBe(mockUserId);
    });
  });

  describe('countByTemplate', () => {
    it('should return count of usage records for a template', async () => {
      mockModel.countDocuments = vi.fn().mockResolvedValue(42);

      const result = await service.countByTemplate('507f1f77bcf86cd799439011');

      expect(result).toBe(42);
      expect(mockModel.countDocuments).toHaveBeenCalledWith(
        expect.objectContaining({
          template: expect.anything(),
        }),
      );
    });

    it('should return 0 when no usage records exist', async () => {
      mockModel.countDocuments = vi.fn().mockResolvedValue(0);

      const result = await service.countByTemplate('507f1f77bcf86cd799439011');

      expect(result).toBe(0);
    });
  });

  describe('findByOrganization', () => {
    it('should return usage records sorted by createdAt descending', async () => {
      const mockUsages = [
        {
          _id: { toString: () => 'id1' },
          organization: { toString: () => 'org1' },
          template: { toString: () => 'tmpl1' },
          user: undefined,
        },
        {
          _id: { toString: () => 'id2' },
          organization: { toString: () => 'org1' },
          template: { toString: () => 'tmpl2' },
          user: undefined,
        },
      ];

      mockModel.find = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockUsages),
        limit: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });

      const result = await service.findByOrganization(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toHaveLength(2);
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: expect.anything(),
        }),
      );
    });

    it('should respect limit parameter', async () => {
      const limitFn = vi.fn().mockReturnThis();
      mockModel.find = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        limit: limitFn,
        sort: vi.fn().mockReturnThis(),
      });

      await service.findByOrganization('507f1f77bcf86cd799439011', 10);

      expect(limitFn).toHaveBeenCalledWith(10);
    });

    it('should default limit to 50', async () => {
      const limitFn = vi.fn().mockReturnThis();
      mockModel.find = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([]),
        limit: limitFn,
        sort: vi.fn().mockReturnThis(),
      });

      await service.findByOrganization('507f1f77bcf86cd799439011');

      expect(limitFn).toHaveBeenCalledWith(50);
    });
  });

  describe('update', () => {
    it('should update a usage record and return entity', async () => {
      const updatedDoc = {
        _id: { toString: () => 'id1' },
        organization: { toString: () => 'org1' },
        rating: 5,
        template: { toString: () => 'tmpl1' },
        user: undefined,
      };

      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(updatedDoc),
      });

      const result = await service.update('id1', { rating: 5 });

      expect(result).toBeDefined();
      expect(result!.rating).toBe(5);
    });

    it('should return null when usage record not found', async () => {
      mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      });

      const result = await service.update('nonexistent', { rating: 3 });

      expect(result).toBeNull();
    });
  });

  describe('getAverageRating', () => {
    it('should return average rating when ratings exist', async () => {
      mockModel.aggregate = vi
        .fn()
        .mockResolvedValue([{ _id: null, averageRating: 4.5 }]);

      const result = await service.getAverageRating('507f1f77bcf86cd799439011');

      expect(result).toBe(4.5);
    });

    it('should return null when no ratings exist', async () => {
      mockModel.aggregate = vi.fn().mockResolvedValue([]);

      const result = await service.getAverageRating('507f1f77bcf86cd799439011');

      expect(result).toBeNull();
    });
  });
});
