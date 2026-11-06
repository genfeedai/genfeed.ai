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
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PromptsOperationsController', () => {
  let controller: PromptsOperationsController;

  /** What reached each boundary during a call. */
  const seen = {
    completionKeys: [] as (string | undefined)[],
    savedPrompts: [] as { enhanced?: string; original?: string }[],
    templateVariables: [] as Record<string, unknown>[],
    transcribed: [] as unknown[],
  };

  const whisperService = {
    transcribeAudio: async (file: unknown) => {
      seen.transcribed.push(file);
      return 'Transcribed text';
    },
  };
  const templatesService = {
    getRenderedPrompt: async (
      _key: string,
      variables: Record<string, unknown>,
    ) => {
      seen.templateVariables.push(variables);
      return 'rendered prompt';
    },
  };
  const promptBuilderService = {
    buildPrompt: async () => ({ input: {} }),
  };
  const replicateService = {
    generateTextCompletionSync: async (
      _model: string,
      _input: unknown,
      apiKeyOverride?: string,
    ) => {
      seen.completionKeys.push(apiKeyOverride);
      return '  Generated reply  ';
    },
  };
  const promptsService = {
    create: async (entity: { enhanced?: string; original?: string }) => {
      seen.savedPrompts.push(entity);
      return entity;
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptsOperationsController],
      providers: [
        {
          provide: LoggerService,
          useValue: {
            error: () => undefined,
            log: () => undefined,
            warn: () => undefined,
          },
        },
        { provide: ReplicateService, useValue: replicateService },
        { provide: PromptBuilderService, useValue: promptBuilderService },
        { provide: PromptsService, useValue: promptsService },
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
    seen.completionKeys = [];
    seen.savedPrompts = [];
    seen.templateVariables = [];
    seen.transcribed = [];
  });

  it('keeps paid voice transcription behind authentication', () => {
    expect(
      Reflect.getMetadata(
        IS_PUBLIC_KEY,
        PromptsOperationsController.prototype.voiceToSpeech,
      ),
    ).toBeUndefined();
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
    expect(seen.transcribed).toEqual([file]);
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
      expect(seen.templateVariables).toEqual([
        expect.objectContaining({ tagGrok: true, tweetContent: 'Hello world' }),
      ]);
    });

    it('returns the trimmed reply unprefixed when tagGrok is absent', async () => {
      const result = await controller.generateTweetReply(
        { tweetContent: 'Hello world' },
        user,
        {} as Request,
      );

      expect(result.reply).toBe('Generated reply');
      expect(seen.templateVariables).toEqual([
        expect.objectContaining({ tagGrok: false }),
      ]);
      expect(seen.savedPrompts).toEqual([
        expect.objectContaining({
          enhanced: '  Generated reply  ',
          original: 'Hello world',
        }),
      ]);
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

      expect(seen.completionKeys).toEqual(['org-openrouter-key']);
    });

    it('dispatches with no key override when the guard did not bypass', async () => {
      await controller.generateTweetReply(
        { tweetContent: 'Hello world' },
        user,
        {} as Request,
      );

      expect(seen.completionKeys).toEqual([undefined]);
    });
  });
});
