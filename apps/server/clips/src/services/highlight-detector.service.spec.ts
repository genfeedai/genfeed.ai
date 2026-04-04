import type { ITranscriptSegment } from '@clips/interfaces/clip-project.interface';
import type { IPipelineConfig } from '@clips/interfaces/pipeline-config.interface';
import { HighlightDetectorService } from '@clips/services/highlight-detector.service';

describe('HighlightDetectorService', () => {
  let service: HighlightDetectorService;

  const mockHttpService = { post: vi.fn() };
  const mockConfigService = { OPENROUTER_API_KEY: 'test-key' };
  const mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

  beforeEach(() => {
    service = new (HighlightDetectorService as any)(
      mockHttpService,
      mockConfigService,
      mockLogger,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('formatTimestamp', () => {
    it('should format 0 seconds as 0:00', () => {
      const result = (service as any).formatTimestamp(0);
      expect(result).toBe('0:00');
    });

    it('should format seconds under a minute', () => {
      const result = (service as any).formatTimestamp(45);
      expect(result).toBe('0:45');
    });

    it('should format exact minutes', () => {
      const result = (service as any).formatTimestamp(120);
      expect(result).toBe('2:00');
    });

    it('should format minutes and seconds', () => {
      const result = (service as any).formatTimestamp(125);
      expect(result).toBe('2:05');
    });

    it('should floor fractional seconds', () => {
      const result = (service as any).formatTimestamp(63.7);
      expect(result).toBe('1:03');
    });

    it('should pad single-digit seconds with leading zero', () => {
      const result = (service as any).formatTimestamp(5);
      expect(result).toBe('0:05');
    });
  });

  describe('formatTranscriptForLLM', () => {
    it('should format segments with timestamps', () => {
      const segments: ITranscriptSegment[] = [
        { end: 5, start: 0, text: 'Hello world' },
        { end: 12, start: 5, text: 'This is a test' },
      ];

      const result = (service as any).formatTranscriptForLLM(segments);
      expect(result).toBe(
        '[0:00 - 0:05] Hello world\n[0:05 - 0:12] This is a test',
      );
    });

    it('should return empty string for empty segments', () => {
      const result = (service as any).formatTranscriptForLLM([]);
      expect(result).toBe('');
    });

    it('should format segments with large timestamps', () => {
      const segments: ITranscriptSegment[] = [
        { end: 3665, start: 3600, text: 'One hour mark' },
      ];

      const result = (service as any).formatTranscriptForLLM(segments);
      expect(result).toBe('[60:00 - 61:05] One hour mark');
    });
  });

  describe('parseHighlights', () => {
    const baseConfig: IPipelineConfig = {
      addCaptions: true,
      aspectRatio: '9:16',
      captionStyle: 'default',
      llmModel: 'deepseek/deepseek-chat',
      maxClipDuration: 90,
      maxClips: 5,
      minClipDuration: 15,
    };

    it('should parse valid JSON array from LLM response', () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 40,
          start_time: 10,
          summary: 'A compelling moment',
          tags: ['funny'],
          title: 'Great hook',
          virality_score: 85,
        },
      ]);

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Great hook');
      expect(result[0].virality_score).toBe(85);
    });

    it('should extract JSON from text with surrounding markdown', () => {
      const content = `Here are the clips:\n\`\`\`json\n[{"start_time":10,"end_time":40,"title":"Hook","summary":"Good","virality_score":80,"tags":[],"clip_type":"hook"}]\n\`\`\``;

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Hook');
    });

    it('should return empty array when no JSON found', () => {
      const result = (service as any).parseHighlights(
        'No valid json here',
        baseConfig,
      );
      expect(result).toEqual([]);
    });

    it('should return empty array for malformed JSON', () => {
      const result = (service as any).parseHighlights(
        '[{invalid json}]',
        baseConfig,
      );
      expect(result).toEqual([]);
    });

    it('should filter clips below minClipDuration', () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 5,
          start_time: 0,
          summary: 'Short clip',
          tags: [],
          title: 'Too short',
          virality_score: 90,
        },
        {
          clip_type: 'hook',
          end_time: 40,
          start_time: 10,
          summary: 'Good clip',
          tags: [],
          title: 'Good length',
          virality_score: 80,
        },
      ]);

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Good length');
    });

    it('should filter clips above maxClipDuration', () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 200,
          start_time: 0,
          summary: 'Long clip',
          tags: [],
          title: 'Too long',
          virality_score: 90,
        },
      ]);

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toEqual([]);
    });

    it('should filter clips with negative start_time', () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 30,
          start_time: -5,
          summary: 'Bad clip',
          tags: [],
          title: 'Negative start',
          virality_score: 90,
        },
      ]);

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toEqual([]);
    });

    it('should filter clips where end_time is not greater than start_time', () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 30,
          start_time: 30,
          summary: 'Bad clip',
          tags: [],
          title: 'Zero duration',
          virality_score: 90,
        },
      ]);

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toEqual([]);
    });

    it('should sort highlights by virality_score descending', () => {
      const content = JSON.stringify([
        {
          clip_type: 'hook',
          end_time: 30,
          start_time: 0,
          summary: 'Ok',
          tags: [],
          title: 'Low score',
          virality_score: 50,
        },
        {
          clip_type: 'hook',
          end_time: 90,
          start_time: 60,
          summary: 'Great',
          tags: [],
          title: 'High score',
          virality_score: 95,
        },
        {
          clip_type: 'hook',
          end_time: 150,
          start_time: 120,
          summary: 'Good',
          tags: [],
          title: 'Mid score',
          virality_score: 75,
        },
      ]);

      const result = (service as any).parseHighlights(content, baseConfig);
      expect(result).toHaveLength(3);
      expect(result[0].virality_score).toBe(95);
      expect(result[1].virality_score).toBe(75);
      expect(result[2].virality_score).toBe(50);
    });

    it('should limit results to maxClips', () => {
      const highlights = Array.from({ length: 10 }, (_, i) => ({
        clip_type: 'hook',
        end_time: i * 30 + 20,
        start_time: i * 30,
        summary: 'Test',
        tags: [],
        title: `Clip ${i}`,
        virality_score: 90 - i,
      }));

      const config = { ...baseConfig, maxClips: 3 };
      const result = (service as any).parseHighlights(
        JSON.stringify(highlights),
        config,
      );
      expect(result).toHaveLength(3);
      expect(result[0].virality_score).toBe(90);
      expect(result[2].virality_score).toBe(88);
    });
  });
});
