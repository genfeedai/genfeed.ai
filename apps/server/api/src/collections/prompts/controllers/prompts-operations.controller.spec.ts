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
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { ParsePromptDto } from '@api/collections/prompts/dto/parse-prompt.dto';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import type { User } from '@clerk/backend';
import { PromptCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('PromptsOperationsController', () => {
  let controller: PromptsOperationsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockPrompt = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    original: 'Test prompt',
    status: 'completed',
  };

  const mockServices = {
    activitiesService: {
      create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      patch: vi.fn().mockResolvedValue({}),
    },
    brandsService: {
      findOne: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      }),
    },
    configService: {},
    creditsUtilsService: {
      deductCreditsFromOrganization: vi.fn(),
      refundOrganizationCredits: vi.fn().mockResolvedValue({}),
    },
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    promptBuilderService: {
      buildPrompt: vi.fn().mockResolvedValue({ input: {} }),
    },
    promptsService: {
      create: vi.fn().mockResolvedValue(mockPrompt),
      findOne: vi.fn().mockResolvedValue(mockPrompt),
      patch: vi.fn().mockResolvedValue(mockPrompt),
    },
    replicateService: {
      generateTextCompletionSync: vi.fn().mockResolvedValue('Generated text'),
    },
    websocketService: {
      emit: vi.fn().mockResolvedValue({}),
      publishBackgroundTaskUpdate: vi.fn().mockResolvedValue({}),
    },
    whisperService: {
      transcribeAudio: vi.fn().mockResolvedValue('Transcribed text'),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsOperationsController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        { provide: ConfigService, useValue: mockServices.configService },
        { provide: BrandsService, useValue: mockServices.brandsService },
        {
          provide: CreditsUtilsService,
          useValue: mockServices.creditsUtilsService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
        {
          provide: ReplicateService,
          useValue: mockServices.replicateService,
        },
        {
          provide: PromptBuilderService,
          useValue: mockServices.promptBuilderService,
        },
        { provide: PromptsService, useValue: mockServices.promptsService },
        {
          provide: NotificationsPublisherService,
          useValue: mockServices.websocketService,
        },
        { provide: WhisperService, useValue: mockServices.whisperService },
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

    controller = module.get<PromptsOperationsController>(
      PromptsOperationsController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('parse', () => {
    it('should parse a prompt successfully', async () => {
      const parseDto: ParsePromptDto = {
        category: PromptCategory.MODELS_PROMPT_IMAGE,
        original: 'Test prompt',
      };

      const result = await controller.parse(parseDto, mockUser);

      expect(result).toBeDefined();
    });
  });

  describe('voiceToSpeech', () => {
    it('should convert voice to speech successfully', async () => {
      const mockFile: Express.Multer.File = {
        buffer: Buffer.from('fake audio data'),
        destination: '',
        encoding: '7bit',
        fieldname: 'file',
        filename: '',
        mimetype: 'audio/mpeg',
        originalname: 'test.mp3',
        path: '',
        size: 1024 * 1024,
        stream: null,
      } as unknown as Express.Multer.File;

      const result = await controller.voiceToSpeech(mockFile);

      expect(mockServices.whisperService.transcribeAudio).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.text).toBeDefined();
    });
  });
});
