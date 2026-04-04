vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { MusicsOperationsController } from '@api/collections/musics/controllers/musics-operations.controller';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { RouterService } from '@api/services/router/router.service';
import { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('MusicsOperationsController', () => {
  let controller: MusicsOperationsController;
  let promptsService: PromptsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockCreateMusicDto: CreateMusicDto = {
    duration: 10,
    outputs: 1,
    text: 'Generate a happy background music',
  };

  const mockServices = {
    activitiesService: {
      create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    },
    brandsService: {
      findOne: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      }),
    },
    creditsUtilsService: { deductCreditsFromOrganization: vi.fn() },
    failedGenerationService: {
      handleFailedMusicGeneration: vi.fn(),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    metadataService: { patch: vi.fn() },
    modelsService: {
      findOne: vi.fn().mockResolvedValue({ cost: 10, key: 'model-key' }),
    },
    musicsService: {
      patch: vi.fn(),
    },
    pollingService: {
      pollForResult: vi
        .fn()
        .mockResolvedValue({ output: ['https://example.com/audio.mp3'] }),
    },
    promptBuilderService: {
      buildPrompt: vi.fn().mockReturnValue({ prompt: 'built prompt' }),
    },
    promptsService: {
      create: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
        original: mockCreateMusicDto.text,
      }),
    },
    replicateService: {
      runModel: vi.fn().mockResolvedValue('generation-id-123'),
    },
    routerService: {
      getDefaultModel: vi.fn().mockResolvedValue('music-model-key'),
      selectModel: vi.fn().mockResolvedValue({
        reason: 'best',
        selectedModel: 'music-model-key',
      }),
    },
    sharedService: {
      saveDocuments: vi.fn().mockResolvedValue({
        ingredientData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
        },
        metadataData: {
          _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
        },
      }),
    },
    websocketService: {
      emit: vi.fn().mockResolvedValue({}),
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue({}),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MusicsOperationsController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        {
          provide: BrandsService,
          useValue: mockServices.brandsService,
        },
        {
          provide: CreditsUtilsService,
          useValue: mockServices.creditsUtilsService,
        },
        {
          provide: FailedGenerationService,
          useValue: mockServices.failedGenerationService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        { provide: MetadataService, useValue: mockServices.metadataService },
        { provide: ModelsService, useValue: mockServices.modelsService },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              defaultMusicModel: 'music-model-key',
            }),
          },
        },
        { provide: MusicsService, useValue: mockServices.musicsService },
        { provide: PromptsService, useValue: mockServices.promptsService },
        {
          provide: PromptBuilderService,
          useValue: mockServices.promptBuilderService,
        },
        { provide: PollingService, useValue: mockServices.pollingService },
        { provide: ReplicateService, useValue: mockServices.replicateService },
        { provide: RouterService, useValue: mockServices.routerService },
        { provide: SharedService, useValue: mockServices.sharedService },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.websocketService,
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
      .overrideGuard(ModelsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<MusicsOperationsController>(
      MusicsOperationsController,
    );
    promptsService = module.get<PromptsService>(PromptsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create music generation request successfully', async () => {
      const result = await controller.create(
        {} as unknown as Request,
        mockUser,
        mockCreateMusicDto,
      );

      expect(promptsService.create).toHaveBeenCalled();
      expect(mockServices.sharedService.saveDocuments).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when text is missing', async () => {
      const invalidDto = { ...mockCreateMusicDto, text: undefined };

      await expect(
        controller.create({} as unknown as Request, mockUser, invalidDto),
      ).rejects.toThrow(HttpException);
    });
  });
});
