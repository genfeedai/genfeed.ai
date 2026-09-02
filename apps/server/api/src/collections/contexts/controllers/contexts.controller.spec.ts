import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AddSourceDto } from '@api/collections/contexts/dto/add-source.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeSourceService } from '@api/collections/contexts/services/knowledge-source.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { KnowledgeBaseCategory } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const organizationId = testId('org');
const userId = testId('user');
const contextId = testId('context');

describe('ContextsController', () => {
  let controller: ContextsController;
  let service: ContextsService;

  const mockUser: User = {
    id: 'user_123',
    organizationId,
    userId,
  } as unknown as User;

  const mockContext = {
    _id: contextId,
    createdAt: new Date(),
    description: 'A test context base',
    entries: [],
    isActive: true,
    label: 'Test Context',
    organization: organizationId,
    type: 'general',
    updatedAt: new Date(),
  };

  const mockContextsService = {
    addEntry: vi.fn(),
    autoCreateFromAccount: vi.fn(),
    create: vi.fn(),
    enhancePrompt: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    getStats: vi.fn(),
    queryContext: vi.fn(),
    remove: vi.fn(),
    removeEntry: vi.fn(),
    update: vi.fn(),
  };

  const mockKnowledgeSourceService = {
    addSource: vi.fn(),
    backfill: vi.fn(),
    removeSource: vi.fn(),
    updateSource: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContextsController],
      providers: [
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
          provide: ContextsService,
          useValue: mockContextsService,
        },
        {
          provide: KnowledgeSourceService,
          useValue: mockKnowledgeSourceService,
        },
      ],
    })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContextsController>(ContextsController);
    service = module.get<ContextsService>(ContextsService);
  });

  const mockReq = { originalUrl: '/contexts' } as Request;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a context base', async () => {
      const createDto: CreateContextDto = {
        description: 'A test context base',
        label: 'Test Context',
        type: 'general',
      };

      mockContextsService.create.mockResolvedValue(mockContext);

      await controller.create(mockReq, createDto, mockUser);

      expect(service.create).toHaveBeenCalledWith(
        createDto,
        mockUser.organizationId,
        mockUser.userId,
      );
    });
  });

  describe('findAll', () => {
    it('should return all contexts for organization', async () => {
      const contexts = [mockContext];
      mockContextsService.findAll.mockResolvedValue(contexts);

      await controller.findAll(mockReq, mockUser);

      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId, {
        category: undefined,
        isActive: undefined,
        search: undefined,
      });
    });

    it('should filter by category', async () => {
      mockContextsService.findAll.mockResolvedValue([mockContext]);

      await controller.findAll(mockReq, mockUser, 'general');

      expect(service.findAll).toHaveBeenCalledWith(mockUser.organizationId, {
        category: 'general',
        isActive: undefined,
        search: undefined,
      });
    });
  });

  describe('findOne', () => {
    it('should return a context by id', async () => {
      const id = contextId;
      mockContextsService.findOne.mockResolvedValue(mockContext);

      await controller.findOne(mockReq, id, mockUser);

      expect(service.findOne).toHaveBeenCalledWith(id, mockUser.organizationId);
    });
  });

  describe('update', () => {
    it('should update a context', async () => {
      const id = contextId;
      const updateDto: UpdateContextDto = {
        label: 'Updated Context',
      };

      const updatedContext = { ...mockContext, ...updateDto };
      mockContextsService.update.mockResolvedValue(updatedContext);

      await controller.update(mockReq, id, updateDto, mockUser);

      expect(service.update).toHaveBeenCalledWith(
        id,
        updateDto,
        mockUser.organizationId,
      );
    });
  });

  describe('remove', () => {
    it('should delete a context', async () => {
      const id = contextId;
      mockContextsService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(id, mockUser.organizationId);
      expect(result).toEqual({ message: 'Context base deleted successfully' });
    });
  });

  describe('addEntry', () => {
    it('should add entry to context', async () => {
      const id = contextId;
      const addEntryDto: AddEntryDto = {
        content: 'New entry content',
        metadata: {},
      };

      const updatedContext = {
        ...mockContext,
        entries: [{ content: 'New entry content' }],
      };
      mockContextsService.addEntry.mockResolvedValue(updatedContext);

      await controller.addEntry(mockReq, id, addEntryDto, mockUser);

      expect(service.addEntry).toHaveBeenCalledWith(
        id,
        addEntryDto,
        mockUser.organizationId,
      );
    });
  });

  describe('removeEntry', () => {
    it('should remove entry from context', async () => {
      const id = contextId;
      const entryId = 'entry123';
      mockContextsService.removeEntry.mockResolvedValue(undefined);

      const result = await controller.removeEntry(id, entryId, mockUser);

      expect(service.removeEntry).toHaveBeenCalledWith(
        id,
        entryId,
        mockUser.organizationId,
      );
      expect(result).toEqual({ message: 'Entry removed successfully' });
    });
  });

  describe('autoCreateFromAccount', () => {
    it('should auto-create context from social account', async () => {
      const dto: AutoCreateContextDto = {
        brandId: 'account123' as never,
        description: 'Auto context',
        label: 'Auto Context',
        platform: 'twitter',
      };

      mockContextsService.autoCreateFromAccount.mockResolvedValue(mockContext);

      await controller.autoCreateFromAccount(mockReq, dto, mockUser);

      expect(service.autoCreateFromAccount).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
        mockUser.userId,
      );
    });
  });

  describe('enhancePrompt', () => {
    it('should return retrieved context without a billing callback', async () => {
      const dto: EnhancePromptDto = {
        contentType: 'caption',
        contextBaseIds: ['context1', 'context2'],
        prompt: 'Original prompt',
      };

      const retrievedContext = {
        context: [
          { content: 'Brand fact', relevance: 0.9, source: 'Brand voice' },
        ],
        enhancedPrompt: 'Original prompt',
        estimatedQualityBoost: 45,
        originalPrompt: 'Original prompt',
      };

      mockContextsService.enhancePrompt.mockResolvedValue(retrievedContext);

      const result = await controller.enhancePrompt(dto, mockUser);

      expect(service.enhancePrompt).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
      );
      expect(result).toEqual(retrievedContext);
    });
  });

  describe('queryContext', () => {
    it('should query context base', async () => {
      const dto: QueryContextDto = {
        contextBaseId: 'context123',
        query: 'What is AI?',
      };

      const queryResult = {
        results: [{ content: 'AI is...', score: 0.95 }],
      };

      mockContextsService.queryContext.mockResolvedValue(queryResult);

      const result = await controller.queryContext(dto, mockUser);

      expect(service.queryContext).toHaveBeenCalledWith(
        dto,
        mockUser.organizationId,
      );
      expect(result).toEqual(queryResult);
    });
  });

  describe('addSource', () => {
    it('adds a knowledge source to the context base', async () => {
      const dto: AddSourceDto = {
        category: KnowledgeBaseCategory.URL,
        label: 'Docs',
        referenceUrl: 'https://docs.example.com',
      };
      mockKnowledgeSourceService.addSource.mockResolvedValue({
        contextBase: mockContext,
        jobId: 'kb-ingest-1',
        source: { id: 'src_1', ...dto },
      });

      const result = await controller.addSource(
        mockReq,
        contextId,
        dto,
        mockUser,
      );

      expect(mockKnowledgeSourceService.addSource).toHaveBeenCalledWith(
        contextId,
        dto,
        mockUser.organizationId,
      );
      expect(result).toMatchObject({
        jobId: 'kb-ingest-1',
        source: expect.objectContaining({ id: 'src_1' }),
      });
    });
  });

  describe('backfillSources', () => {
    it('queues a tenant-scoped backfill', async () => {
      mockKnowledgeSourceService.backfill.mockResolvedValue({
        jobId: 'kb-backfill-org',
        queued: 1,
      });

      await expect(controller.backfillSources(mockUser)).resolves.toEqual({
        jobId: 'kb-backfill-org',
        queued: 1,
      });
      expect(mockKnowledgeSourceService.backfill).toHaveBeenCalledWith(
        mockUser.organizationId,
      );
    });
  });

  describe('getStats', () => {
    it('should return context stats', async () => {
      const id = contextId;
      const stats = {
        averageConfidence: 0.85,
        totalEntries: 100,
        totalVectors: 100,
      };

      mockContextsService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats(id, mockUser);

      expect(service.getStats).toHaveBeenCalledWith(
        id,
        mockUser.organizationId,
      );
      expect(result).toEqual(stats);
    });
  });
});
