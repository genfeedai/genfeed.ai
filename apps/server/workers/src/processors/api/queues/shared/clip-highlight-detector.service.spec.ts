import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { ClipHighlightDetector } from './clip-highlight-detector.service';

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function llmResponse(content: string) {
  return { data: { choices: [{ message: { content } }] } };
}

describe('ClipHighlightDetector', () => {
  let detector: ClipHighlightDetector;
  let logger: LoggerService;
  let httpService: { post: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  const segments = [
    { end: 10, start: 0, text: 'Hello world' },
    { end: 75, start: 65, text: 'Amazing hook right here' },
  ];

  beforeEach(() => {
    logger = createMockLogger();
    httpService = { post: vi.fn() };
    configService = { get: vi.fn().mockReturnValue('mock-api-key') };

    detector = new ClipHighlightDetector(
      logger,
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  describe('prompt construction', () => {
    it('sends the system prompt and a user prompt requesting maxClips clips', async () => {
      httpService.post.mockReturnValue(of(llmResponse('[]')));

      await detector.detectHighlights('full text', segments, 7);

      expect(httpService.post).toHaveBeenCalledTimes(1);
      const [url, body, options] = httpService.post.mock.calls[0];

      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(body.model).toBe('openai/gpt-4o');
      expect(body.temperature).toBe(0.3);
      expect(body.stream).toBe(false);
      expect(body.max_tokens).toBe(4096);

      const [systemMsg, userMsg] = body.messages;
      expect(systemMsg.role).toBe('system');
      expect(systemMsg.content).toContain('viral content analyst');
      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toContain('find the 7 best clips');

      expect(options.headers.Authorization).toBe('Bearer mock-api-key');
      expect(options.timeout).toBe(60_000);
    });

    it('formats transcript segments as [m:ss - m:ss] timestamps', async () => {
      httpService.post.mockReturnValue(of(llmResponse('[]')));

      await detector.detectHighlights('full text', segments, 5);

      const userPrompt = httpService.post.mock.calls[0][1].messages[1].content;
      // 0s -> 0:00, 10s -> 0:10, 65s -> 1:05, 75s -> 1:15
      expect(userPrompt).toContain('[0:00 - 0:10] Hello world');
      expect(userPrompt).toContain('[1:05 - 1:15] Amazing hook right here');
    });

    it('reads the OpenRouter API key from config', async () => {
      httpService.post.mockReturnValue(of(llmResponse('[]')));

      await detector.detectHighlights('full text', segments, 5);

      expect(configService.get).toHaveBeenCalledWith('OPENROUTER_API_KEY');
    });
  });

  describe('parsing and filtering', () => {
    it('returns highlights parsed from a valid JSON array', async () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 30,
          start_time: 0,
          summary: 'Great opening',
          tags: ['intro'],
          title: 'Epic intro',
          virality_score: 85,
        },
      ]);
      httpService.post.mockReturnValue(of(llmResponse(content)));

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Epic intro');
    });

    it('extracts the JSON array when the model wraps it in prose/markdown', async () => {
      const content = `Here are the clips:\n\n[{"clip_type":"hook","end_time":40,"start_time":0,"summary":"s","tags":[],"title":"T","virality_score":60}]\n\nHope this helps!`;
      httpService.post.mockReturnValue(of(llmResponse(content)));

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('T');
    });

    it('filters clips outside the 15-90s duration window', async () => {
      const content = JSON.stringify([
        {
          clip_type: 'a',
          end_time: 10,
          start_time: 0,
          summary: 's',
          tags: [],
          title: 'too short',
          virality_score: 90,
        },
        {
          clip_type: 'b',
          end_time: 200,
          start_time: 0,
          summary: 's',
          tags: [],
          title: 'too long',
          virality_score: 90,
        },
        {
          clip_type: 'c',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'just right',
          virality_score: 90,
        },
      ]);
      httpService.post.mockReturnValue(of(llmResponse(content)));

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result.map((h) => h.title)).toEqual(['just right']);
    });

    it('drops clips with out-of-range virality scores', async () => {
      const content = JSON.stringify([
        {
          clip_type: 'a',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'zero',
          virality_score: 0,
        },
        {
          clip_type: 'b',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'over',
          virality_score: 101,
        },
        {
          clip_type: 'c',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'ok',
          virality_score: 55,
        },
      ]);
      httpService.post.mockReturnValue(of(llmResponse(content)));

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result.map((h) => h.title)).toEqual(['ok']);
    });

    it('sorts by virality_score descending', async () => {
      const content = JSON.stringify([
        {
          clip_type: 'a',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'low',
          virality_score: 40,
        },
        {
          clip_type: 'b',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'high',
          virality_score: 95,
        },
        {
          clip_type: 'c',
          end_time: 45,
          start_time: 15,
          summary: 's',
          tags: [],
          title: 'mid',
          virality_score: 70,
        },
      ]);
      httpService.post.mockReturnValue(of(llmResponse(content)));

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result.map((h) => h.title)).toEqual(['high', 'mid', 'low']);
    });

    it('caps the result at maxClips', async () => {
      const many = Array.from({ length: 8 }, (_, i) => ({
        clip_type: 'hook',
        end_time: 45,
        start_time: 15,
        summary: 's',
        tags: [],
        title: `clip-${i}`,
        virality_score: 90 - i,
      }));
      httpService.post.mockReturnValue(of(llmResponse(JSON.stringify(many))));

      const result = await detector.detectHighlights('t', segments, 3);

      expect(result).toHaveLength(3);
      expect(result.map((h) => h.title)).toEqual([
        'clip-0',
        'clip-1',
        'clip-2',
      ]);
    });
  });

  describe('fallback behavior', () => {
    it('returns an empty array when the response has no JSON array', async () => {
      httpService.post.mockReturnValue(
        of(llmResponse('Sorry, I could not find any clips.')),
      );

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns an empty array when the provider response is malformed (no content)', async () => {
      httpService.post.mockReturnValue(of({ data: {} }));

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns an empty array when the JSON array fails to parse', async () => {
      httpService.post.mockReturnValue(
        of(llmResponse('[{ this is not valid json }]')),
      );

      const result = await detector.detectHighlights('t', segments, 5);

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalled();
    });

    it('propagates provider transport errors to the caller', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('OpenRouter unreachable')),
      );

      await expect(detector.detectHighlights('t', segments, 5)).rejects.toThrow(
        'OpenRouter unreachable',
      );
    });
  });
});
