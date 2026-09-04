vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw new HttpException(response, 400);
  }),
  returnForbidden: vi.fn(),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import type { PromptQueryDto } from '@api/collections/prompts/dto/prompt-query.dto';
import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptCategory } from '@genfeedai/contracts';
import { AGENT_CHAT_MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PromptsController', () => {
  let controller: PromptsController;
  let service: PromptsService;

  const mockUser = {
    id: 'user_123',
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockReq = {} as Request;
  const mockPromptQuery = {
    isDeleted: false,
    limit: 10,
    page: 1,
    sort: 'createdAt: -1',
  } satisfies PromptQueryDto;

  const mockPrompt = {
    _id: testId('prompt'),
    isDeleted: false,
    organization: testId('org'),
    original: 'Test prompt',
    status: 'completed',
    user: testId('user'),
  };

  const mockPromptsService = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const mockOpenRouterService = {
    chatCompletion: vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Enhanced prompt' } }],
      id: 'or-1',
      usage: { completion_tokens: 10, prompt_tokens: 10, total_tokens: 20 },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsController],
      providers: [
        {
          provide: PromptsService,
          useValue: mockPromptsService,
        },
        {
          provide: ConfigService,
          useValue: {},
        },
        {
          provide: BrandsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: CreditsUtilsService,
          useValue: { refundOrganizationCredits: vi.fn() },
        },
        {
          provide: IngredientsService,
          useValue: { findOne: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: OpenRouterService,
          useValue: mockOpenRouterService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: { emit: vi.fn(), publishBackgroundTaskUpdate: vi.fn() },
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<PromptsController>(PromptsController);
    service = module.get<PromptsService>(PromptsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a prompt and return serialized data', async () => {
      const createPromptDto: CreatePromptDto = {
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        original: 'Generate a creative social media post',
      };

      mockPromptsService.create.mockResolvedValue(mockPrompt);

      const result = await controller.create(
        mockReq,
        createPromptDto,
        mockUser,
      );

      expect(service.create).toHaveBeenCalled();
      expect(mockOpenRouterService.chatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
        }),
      );
      expect(result).toBeDefined();
    });

    it('stores a skipped prompt as generated without calling the enhancement provider', async () => {
      const createPromptDto: CreatePromptDto = {
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        isSkipEnhancement: true,
        original: 'Use this exact image prompt',
      };
      mockPromptsService.create.mockResolvedValue(mockPrompt);

      const result = await controller.create(
        mockReq,
        createPromptDto,
        mockUser,
      );

      expect(mockPromptsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          enhanced: createPromptDto.original,
          isSkipEnhancement: true,
          status: 'GENERATED',
        }),
        [{ path: 'ingredients' }],
      );
      expect(mockOpenRouterService.chatCompletion).not.toHaveBeenCalled();
      expect(result).toBe(mockPrompt);
    });
  });

  describe('findAll', () => {
    it('should return prompts collection', async () => {
      const mockData = {
        docs: [mockPrompt],
        limit: 10,
        page: 1,
        totalDocs: 1,
      };

      mockPromptsService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAll(
        mockReq,
        mockUser,
        mockPromptQuery,
      );

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('scopes the list to the current user so marketplace installs are listable', async () => {
      const installedPrompt = {
        ...mockPrompt,
        _id: testId('prompt', 2),
        isFavorite: true,
        original: 'Installed from the marketplace',
        userId: testId('user'),
      };

      mockPromptsService.findAll.mockResolvedValue({
        docs: [installedPrompt],
        limit: 10,
        page: 1,
        totalDocs: 1,
      });

      const result = await controller.findAll(
        mockReq,
        mockUser,
        mockPromptQuery,
      );

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            userId: testId('user'),
          }),
        }),
        expect.anything(),
      );
      expect(result).toEqual([installedPrompt]);
    });
  });

  describe('findOne', () => {
    it('should return a prompt by id', async () => {
      const promptId = testId('prompt');
      mockPromptsService.findOne.mockResolvedValue(mockPrompt);

      const result = await controller.findOne(mockReq, promptId, mockUser);

      expect(service.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when prompt not found', async () => {
      const promptId = testId('prompt');
      mockPromptsService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(mockReq, promptId, mockUser);

      expect(result).toHaveProperty('statusCode', 404);
    });
  });

  describe('update', () => {
    it('should update a prompt', async () => {
      const promptId = testId('prompt');
      const updatePromptDto: UpdatePromptDto = {
        isFavorite: true,
      };

      mockPromptsService.findOne
        .mockResolvedValueOnce(mockPrompt)
        .mockResolvedValueOnce({ ...mockPrompt, ...updatePromptDto });
      mockPromptsService.patch.mockResolvedValue(undefined);

      const result = await controller.update(
        mockReq,
        promptId,
        updatePromptDto,
        mockUser,
      );

      expect(service.patch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when prompt does not exist', async () => {
      const promptId = testId('prompt');
      mockPromptsService.findOne.mockResolvedValue(null);

      const result = await controller.update(mockReq, promptId, {}, mockUser);

      expect(result).toHaveProperty('statusCode', 404);
    });
  });
});
