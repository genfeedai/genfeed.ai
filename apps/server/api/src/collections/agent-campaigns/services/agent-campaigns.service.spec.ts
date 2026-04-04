import { AgentCampaign } from '@api/collections/agent-campaigns/schemas/agent-campaign.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AgentCampaignsService } from './agent-campaigns.service';

describe('AgentCampaignsService', () => {
  let service: AgentCampaignsService;

  const createMockQuery = (resolvedValue: unknown = null) => {
    const query = {
      exec: vi.fn().mockResolvedValue(resolvedValue),
      lean: vi.fn(),
      populate: vi.fn(),
    };
    query.lean.mockReturnValue(query);
    query.populate.mockReturnValue(query);
    return query;
  };

  let mockModel: {
    aggregate: ReturnType<typeof vi.fn>;
    aggregatePaginate: ReturnType<typeof vi.fn>;
    collection: { name: string };
    find: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    modelName: string;
    prototype: { save: ReturnType<typeof vi.fn> };
    updateMany: ReturnType<typeof vi.fn>;
  };

  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn(),
      collection: { name: 'agentcampaigns' },
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOne: vi.fn(),
      modelName: 'AgentCampaign',
      prototype: { save: vi.fn() },
      updateMany: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentCampaignsService,
        {
          provide: getModelToken(AgentCampaign.name, DB_CONNECTIONS.AGENT),
          useValue: mockModel,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AgentCampaignsService>(AgentCampaignsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be an instance of AgentCampaignsService', () => {
    expect(service).toBeInstanceOf(AgentCampaignsService);
  });

  describe('findOneById', () => {
    it('should query with ObjectId _id and organization', async () => {
      const id = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();
      const mockQuery = createMockQuery(null);
      mockModel.findOne.mockReturnValue(mockQuery);

      await service.findOneById(id, orgId);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(Types.ObjectId),
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
        }),
      );
    });

    it('should return null when campaign is not found', async () => {
      const id = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();
      const mockQuery = createMockQuery(null);
      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await service.findOneById(id, orgId);

      expect(result).toBeNull();
    });

    it('should return campaign document when found', async () => {
      const id = new Types.ObjectId();
      const orgId = new Types.ObjectId();
      const campaign = {
        _id: id,
        isDeleted: false,
        name: 'Test Campaign',
        organization: orgId,
      };
      const mockQuery = createMockQuery(campaign);
      mockModel.findOne.mockReturnValue(mockQuery);

      const result = await service.findOneById(id.toString(), orgId.toString());

      expect(result).toEqual(campaign);
    });

    it('should convert string ids to ObjectId instances', async () => {
      const id = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();
      const mockQuery = createMockQuery(null);
      mockModel.findOne.mockReturnValue(mockQuery);

      await service.findOneById(id, orgId);

      const callArg = mockModel.findOne.mock.calls[0][0];
      expect(callArg._id).toBeInstanceOf(Types.ObjectId);
      expect(callArg.organization).toBeInstanceOf(Types.ObjectId);
    });

    it('should filter out deleted campaigns', async () => {
      const id = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();
      const mockQuery = createMockQuery(null);
      mockModel.findOne.mockReturnValue(mockQuery);

      await service.findOneById(id, orgId);

      const callArg = mockModel.findOne.mock.calls[0][0];
      expect(callArg.isDeleted).toBe(false);
    });

    it('should propagate errors from the model', async () => {
      const id = new Types.ObjectId().toString();
      const orgId = new Types.ObjectId().toString();
      const error = new Error('Database connection failed');
      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(error),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(service.findOneById(id, orgId)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should use the correct DB connection (AGENT)', () => {
      // Verify the model token uses the agent connection
      const token = getModelToken(AgentCampaign.name, DB_CONNECTIONS.AGENT);
      expect(token).toContain(DB_CONNECTIONS.AGENT);
    });

    it('should handle different organization IDs independently', async () => {
      const id = new Types.ObjectId().toString();
      const orgId1 = new Types.ObjectId().toString();
      const orgId2 = new Types.ObjectId().toString();

      const mockQuery1 = createMockQuery({ _id: id, name: 'Campaign 1' });
      const mockQuery2 = createMockQuery(null);
      mockModel.findOne
        .mockReturnValueOnce(mockQuery1)
        .mockReturnValueOnce(mockQuery2);

      const result1 = await service.findOneById(id, orgId1);
      const result2 = await service.findOneById(id, orgId2);

      expect(result1).not.toBeNull();
      expect(result2).toBeNull();
    });
  });
});
