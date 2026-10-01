import { LlmStructuredOutputError } from '@api/services/integrations/llm/llm-structured-output.error';
import {
  buildStructuredResponseFormat,
  toStructuredJsonSchema,
} from '@api/services/integrations/llm/structured-output.util';
import {
  CLIP_HIGHLIGHT_DETECTION_SCHEMA_NAME,
  clipHighlightDetectionSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import { of, throwError } from 'rxjs';
import { ClipHighlightDetector } from './clip-highlight-detector.service';

const clip = {
  start_time: 0,
  end_time: 30,
  title: 'Hook',
  summary: 'Summary',
  virality_score: 80,
  tags: [],
  clip_type: 'hook',
};
const response = (content: string) =>
  of({ data: { choices: [{ message: { content } }] } });
describe('ClipHighlightDetector structured boundary', () => {
  const segments = [{ start: 0, end: 30, text: 'Complete teaching moment' }];
  let post: ReturnType<typeof vi.fn>;
  let warn: ReturnType<typeof vi.fn>;
  let service: ClipHighlightDetector;
  beforeEach(() => {
    post = vi.fn();
    warn = vi.fn();
    service = new ClipHighlightDetector(
      { warn } as never,
      { post } as never,
      { get: vi.fn().mockReturnValue('key') } as never,
    );
  });
  it('sorts and caps validated highlights', async () => {
    post.mockReturnValue(
      response(
        JSON.stringify({
          highlights: [clip, { ...clip, title: 'Best', virality_score: 99 }],
        }),
      ),
    );
    expect(await service.detectHighlights('text', segments, 1)).toEqual([
      { ...clip, title: 'Best', virality_score: 99 },
    ]);
  });
  it.each([
    '',
    'Here are clips: {"highlights":[]}',
    '{"highlights":[{"title":"incomplete"}]}',
  ])('repairs invalid completed output once: %s', async (raw) => {
    post
      .mockReturnValueOnce(response(raw))
      .mockReturnValueOnce(response(JSON.stringify({ highlights: [clip] })));
    expect(
      await service.detectHighlights('text', segments, 1, {
        model: 'override',
      }),
    ).toEqual([clip]);
    expect(post).toHaveBeenCalledTimes(2);
    for (const [url, body, options] of post.mock.calls) {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(body).toMatchObject({
        model: 'override',
        max_tokens: 4096,
        temperature: 0.3,
        stream: false,
        provider: { data_collection: 'deny', zdr: true },
      });
      expect(body.response_format).toEqual(
        buildStructuredResponseFormat(
          CLIP_HIGHLIGHT_DETECTION_SCHEMA_NAME,
          toStructuredJsonSchema(clipHighlightDetectionSchema),
        ),
      );
      expect(options).toEqual({
        timeout: 60_000,
        headers: {
          Authorization: 'Bearer key',
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://genfeed.ai',
          'X-Title': 'GenFeed AI Clip Factory',
        },
      });
    }
    expect(post.mock.calls[1][1].messages.slice(0, 2)).toEqual(
      post.mock.calls[0][1].messages,
    );
    expect(post.mock.calls[1][1].messages[2]).toEqual({
      role: 'assistant',
      content: raw,
    });
    expect(post.mock.calls[1][1].messages[3].content).toContain(
      'clip_highlight_detection',
    );
  });
  it('converts refined schema but enforces duration at runtime', async () => {
    expect(toStructuredJsonSchema(clipHighlightDetectionSchema)).toHaveProperty(
      'properties.highlights',
    );
    post.mockReturnValue(
      response(JSON.stringify({ highlights: [{ ...clip, end_time: 14 }] })),
    );
    await expect(
      service.detectHighlights('text', segments, 1),
    ).rejects.toBeInstanceOf(LlmStructuredOutputError);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('returns valid empty output with the default model', async () => {
    post.mockReturnValue(response('{"highlights":[]}'));
    expect(await service.detectHighlights('text', segments, 1)).toEqual([]);
    expect(post.mock.calls[0][1].model).toBe(LLM_DEFAULTS.highlighted);
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('propagates transport failure without repair or default fallback', async () => {
    const error = new Error('down');
    post.mockReturnValue(throwError(() => error));
    await expect(service.detectHighlights('text', segments, 1)).rejects.toBe(
      error,
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
  it.each(['transport', 'invalid', 'empty'])(
    'uses explicitly selected deterministic fallback for %s',
    async (kind) => {
      post.mockReturnValue(
        kind === 'transport'
          ? throwError(() => new Error('down'))
          : response(kind === 'invalid' ? '{}' : '{"highlights":[]}'),
      );
      expect(
        await service.detectHighlights('text', segments, 1, {
          fallback: 'deterministic',
        }),
      ).toEqual([
        {
          ...clip,
          clip_type: 'educational',
          summary: segments[0].text,
          title: segments[0].text,
          virality_score: 70,
        },
      ]);
      expect(warn).toHaveBeenCalled();
    },
  );
});
