import { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { RouterService } from '@server/services/router/router.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

describe('ContextsService', () => {
  let service: ContextsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContextsService,
        {
          provide: PrismaService,
          useValue: {
            find: vi.fn().mockReturnThis(),
            findOne: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('test-key') },
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
        {
          provide: ReplicateService,
          useValue: { generateEmbedding: vi.fn().mockResolvedValue([]) },
        },
        {
          provide: RouterService,
          useValue: { getDefaultModel: vi.fn().mockResolvedValue('bge') },
        },
      ],
    }).compile();

    service = module.get<ContextsService>(ContextsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have enhancePrompt method (RAG magic!)', () => {
    expect(service.enhancePrompt).toBeDefined();
  });

  it('should have queryContext method', () => {
    expect(service.queryContext).toBeDefined();
  });

  it('should have autoCreateFromAccount method', () => {
    expect(service.autoCreateFromAccount).toBeDefined();
  });
});
