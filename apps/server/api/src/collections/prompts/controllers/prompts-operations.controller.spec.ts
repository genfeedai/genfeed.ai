import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PromptsOperationsController', () => {
  let controller: PromptsOperationsController;

  const whisperService = {
    transcribeAudio: vi.fn().mockResolvedValue('Transcribed text'),
  };
  const templatesService = {
    getRenderedPrompt: vi.fn().mockResolvedValue('rendered prompt'),
  };
  const promptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({ input: {} }),
  };
  const replicateService = {
    generateTextCompletionSync: vi
      .fn()
      .mockResolvedValue('  Generated reply  '),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsOperationsController],
      providers: [
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
        { provide: ReplicateService, useValue: replicateService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        {
          provide: PromptsService,
          useValue: { create: vi.fn() },
        },
        { provide: WhisperService, useValue: whisperService },
        { provide: TemplatesService, useValue: templatesService },
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

  // `tagGrok` reaches the reply twice: once as a template variable, and again
  // as the literal `@grok ` prefix applied after generation. Only the prefix is
  // observable in the response, and it was uncovered until #4555 — its only
  // test sat in `test/unit/`, which no vitest config included.
  describe('generateTweetReply', () => {
    const user = {
      brandId: 'brd_1',
      id: 'usr_1',
      organizationId: 'org_1',
      userId: 'usr_1',
    };

    it('prefixes the generated reply with @grok when tagGrok is true', async () => {
      const result = await controller.generateTweetReply(
        { tagGrok: true, tweetContent: 'Hello world' },
        user,
        {} as Request,
      );

      expect(result.reply).toBe('@grok Generated reply');
      expect(templatesService.getRenderedPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tagGrok: true }),
        'org_1',
      );
    });

    it('returns the trimmed reply unprefixed when tagGrok is absent', async () => {
      const result = await controller.generateTweetReply(
        { tweetContent: 'Hello world' },
        user,
        {} as Request,
      );

      expect(result.reply).toBe('Generated reply');
      expect(templatesService.getRenderedPrompt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ tagGrok: false }),
        'org_1',
      );
    });

    // #5375: the resolved BYOK key travels on request.creditsConfig, set by
    // CreditsGuard before the handler runs — never re-resolved here.
    it('forwards a resolved BYOK key to the completion call', async () => {
      const request = {
        creditsConfig: { byokApiKeyOverride: 'org-openrouter-key' },
      } as unknown as Request;

      await controller.generateTweetReply(
        { tweetContent: 'Hello world' },
        user,
        request,
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'org-openrouter-key',
      );
    });

    it('dispatches with no key override when the guard did not bypass', async () => {
      await controller.generateTweetReply(
        { tweetContent: 'Hello world' },
        user,
        {} as Request,
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });
  });
});
