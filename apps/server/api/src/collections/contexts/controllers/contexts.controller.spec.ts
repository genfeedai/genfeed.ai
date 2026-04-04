import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { AddEntryDto } from '@api/collections/contexts/dto/add-entry.dto';
import { AutoCreateContextDto } from '@api/collections/contexts/dto/autocreate.dto';
import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';
import { EnhancePromptDto } from '@api/collections/contexts/dto/enhance-prompt.dto';
import { QueryContextDto } from '@api/collections/contexts/dto/query.dto';
import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ContextsController', () => {
  let controller: ContextsController;
  let service: ContextsService;

  const mockUser: User = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockContext = {
    _id: '507f1f77bcf86cd799439014',
    createdAt: new Date(),
    description: 'A test context base',
    entries: [],
    isActive: true,
    label: 'Test Context',
    organization: '507f1f77bcf86cd799439012',
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContextsController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
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
          provide: ContextsService,
          useValue: mockContextsService,
        },
      ],
    })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
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
        mockUser.publicMetadata.organization,
        mockUser.id,
      );
    });
  });

  describe('findAll', () => {
    it('should return all contexts for organization', async () => {
      const contexts = [mockContext];
      mockContextsService.findAll.mockResolvedValue(contexts);

      await controller.findAll(mockReq, mockUser);

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        {
          category: undefined,
          isActive: undefined,
          search: undefined,
        },
      );
    });

    it('should filter by category', async () => {
      mockContextsService.findAll.mockResolvedValue([mockContext]);

      await controller.findAll(mockReq, mockUser, 'general');

      expect(service.findAll).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        {
          category: 'general',
          isActive: undefined,
          search: undefined,
        },
      );
    });
  });

  describe('findOne', () => {
    it('should return a context by id', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockContextsService.findOne.mockResolvedValue(mockContext);

      await controller.findOne(mockReq, id, mockUser);

      expect(service.findOne).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
    });
  });

  describe('update', () => {
    it('should update a context', async () => {
      const id = '507f1f77bcf86cd799439014';
      const updateDto: UpdateContextDto = {
        label: 'Updated Context',
      };

      const updatedContext = { ...mockContext, ...updateDto };
      mockContextsService.update.mockResolvedValue(updatedContext);

      await controller.update(mockReq, id, updateDto, mockUser);

      expect(service.update).toHaveBeenCalledWith(
        id,
        updateDto,
        mockUser.publicMetadata.organization,
      );
    });
  });

  describe('remove', () => {
    it('should delete a context', async () => {
      const id = '507f1f77bcf86cd799439014';
      mockContextsService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id, mockUser);

      expect(service.remove).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual({ message: 'Context base deleted successfully' });
    });
  });

  describe('addEntry', () => {
    it('should add entry to context', async () => {
      const id = '507f1f77bcf86cd799439014';
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
        mockUser.publicMetadata.organization,
      );
    });
  });

  describe('removeEntry', () => {
    it('should remove entry from context', async () => {
      const id = '507f1f77bcf86cd799439014';
      const entryId = 'entry123';
      mockContextsService.removeEntry.mockResolvedValue(undefined);

      const result = await controller.removeEntry(id, entryId, mockUser);

      expect(service.removeEntry).toHaveBeenCalledWith(
        id,
        entryId,
        mockUser.publicMetadata.organization,
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
        mockUser.publicMetadata.organization,
        mockUser.id,
      );
    });
  });

  describe('enhancePrompt', () => {
    it('should enhance prompt with RAG', async () => {
      const dto: EnhancePromptDto = {
        contentType: 'caption',
        contextBaseIds: ['context1', 'context2'],
        prompt: 'Original prompt',
      };

      const enhancedPrompt = {
        context: [],
        enhanced: 'Enhanced prompt with context',
        original: 'Original prompt',
      };

      mockContextsService.enhancePrompt.mockResolvedValue(enhancedPrompt);

      const result = await controller.enhancePrompt(mockReq, dto, mockUser);

      expect(service.enhancePrompt).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
        expect.any(Function),
      );
      expect(result).toEqual(enhancedPrompt);
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
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(queryResult);
    });
  });

  describe('getStats', () => {
    it('should return context stats', async () => {
      const id = '507f1f77bcf86cd799439014';
      const stats = {
        averageConfidence: 0.85,
        totalEntries: 100,
        totalVectors: 100,
      };

      mockContextsService.getStats.mockResolvedValue(stats);

      const result = await controller.getStats(id, mockUser);

      expect(service.getStats).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(stats);
    });
  });
});
