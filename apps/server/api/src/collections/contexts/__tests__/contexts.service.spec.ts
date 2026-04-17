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
