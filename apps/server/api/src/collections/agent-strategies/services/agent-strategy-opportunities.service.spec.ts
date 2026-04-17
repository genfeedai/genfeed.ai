import { AgentStrategyOpportunity } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('AgentStrategyOpportunitiesService', () => {
  let service: AgentStrategyOpportunitiesService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    model = {
      create: vi.fn(),
      findOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentStrategyOpportunitiesService,
        {
          provide: getModelToken(
            AgentStrategyOpportunity.name,
            DB_CONNECTIONS.AGENT,
          ),
          useValue: model,
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

    service = module.get(AgentStrategyOpportunitiesService);
  });

  it('dedupes opportunity creation when a matching queued item exists', async () => {
    const existing = { _id: new Types.ObjectId(), topic: 'AI hooks' };
    model.findOne.mockReturnValue({
      exec: vi.fn().mockResolvedValue(existing),
    });

    const result = await service.createIfMissing({
      estimatedCreditCost: 10,
      expectedTrafficScore: 80,
      formatCandidates: ['text'],
      organization: new Types.ObjectId(),
      platformCandidates: ['twitter'],
      priorityScore: 90,
      relevanceScore: 95,
      sourceRef: 'trend-1',
      sourceType: 'trend',
      strategy: new Types.ObjectId(),
      topic: 'AI hooks',
    });

    expect(result).toBe(existing);
    expect(model.create).not.toHaveBeenCalled();
  });
});
