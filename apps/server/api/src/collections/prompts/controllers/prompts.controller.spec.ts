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

import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { CreatePromptDto } from '@api/collections/prompts/dto/create-prompt.dto';
import { UpdatePromptDto } from '@api/collections/prompts/dto/update-prompt.dto';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { User } from '@clerk/backend';
import { PromptCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('PromptsController', () => {
  let controller: PromptsController;
  let service: PromptsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockReq = {} as Request;

  const mockPrompt = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    isDeleted: false,
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    original: 'Test prompt',
    status: 'completed',
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
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
      .overrideGuard(ClerkGuard)
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
          model: 'openrouter/free',
        }),
      );
      expect(result).toBeDefined();
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

      const result = await controller.findAll(mockReq, mockUser, {});

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should return a prompt by id', async () => {
      const promptId = '507f1f77bcf86cd799439014';
      mockPromptsService.findOne.mockResolvedValue(mockPrompt);

      const result = await controller.findOne(mockReq, promptId, mockUser);

      expect(service.findOne).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should return not found when prompt not found', async () => {
      const promptId = '507f1f77bcf86cd799439014';
      mockPromptsService.findOne.mockResolvedValue(null);

      const result = await controller.findOne(mockReq, promptId, mockUser);

      expect(result).toHaveProperty('statusCode', 404);
    });
  });

  describe('update', () => {
    it('should update a prompt', async () => {
      const promptId = '507f1f77bcf86cd799439014';
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
      const promptId = '507f1f77bcf86cd799439014';
      mockPromptsService.findOne.mockResolvedValue(null);

      const result = await controller.update(mockReq, promptId, {}, mockUser);

      expect(result).toHaveProperty('statusCode', 404);
    });
  });
});
