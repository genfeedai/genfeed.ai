import type { GenerateLaunchCopyDto } from '@api/collections/launch-copy/dto/generate-launch-copy.dto';
import { LaunchCopyGeneratorService } from '@api/collections/launch-copy/services/launch-copy-generator.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { Platform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('LaunchCopyGeneratorService', () => {
  let service: LaunchCopyGeneratorService;
  let chatCompletionMock: ReturnType<typeof vi.fn>;

  const loggerMock = {
    error: vi.fn(),
    log: vi.fn(),
  } as unknown as LoggerService;

  const respond = (content: string) => ({
    choices: [
      { finish_reason: 'stop', message: { content, role: 'assistant' } },
    ],
    id: 'x',
    usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
  });

  const hnDto: GenerateLaunchCopyDto = {
    brandId: 'brand-1',
    channel: Platform.HACKER_NEWS,
    description: 'A CLI that lints Postgres migrations',
    productName: 'MigraLint',
  };

  const phDto: GenerateLaunchCopyDto = {
    brandId: 'brand-1',
    channel: Platform.PRODUCT_HUNT,
    description: 'A CLI that lints Postgres migrations',
    productName: 'MigraLint',
    variationsCount: 4,
  };

  beforeEach(async () => {
    chatCompletionMock = vi.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LaunchCopyGeneratorService,
        { provide: LoggerService, useValue: loggerMock },
        { provide: ConfigService, useValue: { get: vi.fn(() => undefined) } },
        {
          provide: LlmDispatcherService,
          useValue: { chatCompletion: chatCompletionMock },
        },
      ],
    }).compile();

    service = module.get<LaunchCopyGeneratorService>(
      LaunchCopyGeneratorService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Hacker News', () => {
    it('parses showHnTitle + firstComment and passes org context to the LLM', async () => {
      chatCompletionMock.mockResolvedValue(
        respond(
          JSON.stringify({
            firstComment: 'I built this because migrations kept breaking prod.',
            showHnTitle:
              'Show HN: MigraLint – a linter for Postgres migrations',
          }),
        ),
      );

      const result = await service.generate('org-1', hnDto);

      expect(result).toEqual({
        channel: Platform.HACKER_NEWS,
        firstComment: 'I built this because migrations kept breaking prod.',
        showHnTitle: 'Show HN: MigraLint – a linter for Postgres migrations',
      });

      const [params, organizationId] = chatCompletionMock.mock.calls[0];
      expect(organizationId).toBe('org-1');
      expect(params.messages[0].role).toBe('system');
      expect(params.messages[0].content).toContain('Show HN');
      expect(params.messages[1].content).toContain('MigraLint');
    });

    it('strips code fences before parsing', async () => {
      chatCompletionMock.mockResolvedValue(
        respond(
          '```json\n{"showHnTitle":"Show HN: MigraLint – lint migrations","firstComment":"hi"}\n```',
        ),
      );

      const result = await service.generate('org-1', hnDto);
      expect(result.showHnTitle).toBe('Show HN: MigraLint – lint migrations');
    });

    it('throws when showHnTitle is missing', async () => {
      chatCompletionMock.mockResolvedValue(
        respond(JSON.stringify({ firstComment: 'only a comment' })),
      );

      await expect(service.generate('org-1', hnDto)).rejects.toThrow(
        'omitted showHnTitle',
      );
    });
  });

  describe('Product Hunt', () => {
    it('parses taglines + makerComment and reflects variationsCount in the prompt', async () => {
      chatCompletionMock.mockResolvedValue(
        respond(
          JSON.stringify({
            makerComment: 'Built this after one too many bad deploys.',
            taglines: ['Lint your migrations', 'Catch bad migrations early'],
          }),
        ),
      );

      const result = await service.generate('org-1', phDto);

      expect(result.channel).toBe(Platform.PRODUCT_HUNT);
      expect(result.taglines).toHaveLength(2);
      expect(result.makerComment).toContain('Built this');

      const [params] = chatCompletionMock.mock.calls[0];
      expect(params.messages[0].content).toContain('4 distinct tagline');
    });

    it('filters non-string taglines and throws when none remain', async () => {
      chatCompletionMock.mockResolvedValue(
        respond(JSON.stringify({ makerComment: 'x', taglines: [1, null, {}] })),
      );

      await expect(service.generate('org-1', phDto)).rejects.toThrow(
        'omitted taglines',
      );
    });
  });

  it('throws on invalid JSON from the model', async () => {
    chatCompletionMock.mockResolvedValue(respond('not json at all'));

    await expect(service.generate('org-1', hnDto)).rejects.toThrow(
      'invalid JSON',
    );
  });
});
