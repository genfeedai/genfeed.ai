import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('PromptsOperationsController', () => {
  let controller: PromptsOperationsController;

  const whisperService = {
    transcribeAudio: vi.fn().mockResolvedValue('Transcribed text'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsOperationsController],
      providers: [
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        {
          provide: ReplicateService,
          useValue: { generateTextCompletionSync: vi.fn() },
        },
        {
          provide: PromptBuilderService,
          useValue: { buildPrompt: vi.fn() },
        },
        {
          provide: PromptsService,
          useValue: { create: vi.fn() },
        },
        { provide: WhisperService, useValue: whisperService },
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
        intercept: (_context: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get(PromptsOperationsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('converts an accepted voice file to text', async () => {
    const file = {
      buffer: Buffer.from('fake audio data'),
      mimetype: 'audio/mpeg',
      originalname: 'test.mp3',
      size: 1024 * 1024,
    };

    await expect(controller.voiceToSpeech(file)).resolves.toEqual({
      text: 'Transcribed text',
    });
    expect(whisperService.transcribeAudio).toHaveBeenCalledWith(file);
  });
});
