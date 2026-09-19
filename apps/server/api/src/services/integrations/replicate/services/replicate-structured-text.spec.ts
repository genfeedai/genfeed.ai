import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { z } from 'zod';

vi.mock('replicate', () => ({
  default: class Replicate {
    predictions = { create: vi.fn() };
    wait = vi.fn();
  },
}));

type TextCompletion = ReplicateService['generateTextCompletionSync'];

const schema = z.object({
  score: z.number(),
  suggested: z.array(z.string()),
});

describe('ReplicateService.generateStructuredTextSync', () => {
  let service: ReplicateService;
  let completion: Mock<TextCompletion>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplicateService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('r8-test') },
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
      ],
    }).compile();

    service = module.get(ReplicateService);
    completion = vi.fn<TextCompletion>();
    service.generateTextCompletionSync = completion;
  });

  it('puts the JSON schema in the prompt and returns validated data', async () => {
    completion.mockResolvedValue('{"score":80,"suggested":["#ai"]}');

    const result = await service.generateStructuredTextSync('owner/model', {
      input: { max_completion_tokens: 512 },
      prompt: 'Suggest hashtags',
      schema,
      schemaName: 'hashtag_suggestions',
    });

    expect(result).toEqual({ score: 80, suggested: ['#ai'] });
    const [, sentInput] = completion.mock.calls[0] as [
      string,
      { prompt: string },
    ];
    expect(sentInput.prompt).toContain('hashtag_suggestions');
    expect(sentInput.prompt).toContain('"additionalProperties":false');
  });

  it('unwraps a markdown-fenced answer rather than failing on transport', async () => {
    completion.mockResolvedValue(
      '```json\n{"score":80,"suggested":["#ai"]}\n```',
    );

    const result = await service.generateStructuredTextSync('owner/model', {
      input: {},
      prompt: 'Suggest hashtags',
      schema,
      schemaName: 'hashtag_suggestions',
    });

    expect(result).toEqual({ score: 80, suggested: ['#ai'] });
    expect(completion).toHaveBeenCalledTimes(1);
  });

  it('repairs once and bills every attempt', async () => {
    completion
      .mockResolvedValueOnce('{"score":"high","suggested":[]}')
      .mockResolvedValueOnce('{"score":80,"suggested":["#ai"]}');
    const onAttempt = vi.fn();

    const result = await service.generateStructuredTextSync('owner/model', {
      input: {},
      onAttempt,
      prompt: 'Suggest hashtags',
      schema,
      schemaName: 'hashtag_suggestions',
    });

    expect(result).toEqual({ score: 80, suggested: ['#ai'] });
    expect(completion).toHaveBeenCalledTimes(2);
    expect(onAttempt).toHaveBeenCalledTimes(2);
  });

  it('throws the typed error when the repair also fails', async () => {
    completion.mockResolvedValue('{"score":"high","suggested":[]}');

    await expect(
      service.generateStructuredTextSync('owner/model', {
        input: {},
        prompt: 'Suggest hashtags',
        schema,
        schemaName: 'hashtag_suggestions',
      }),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
    expect(completion).toHaveBeenCalledTimes(2);
  });
});
