import type { IClipProject } from '@clips/interfaces/clip-project.interface';
import { DEFAULT_PIPELINE_CONFIG } from '@clips/interfaces/pipeline-config.interface';
import { ClipperPipelineService } from '@clips/services/clipper-pipeline.service';

describe('ClipperPipelineService', () => {
  let service: ClipperPipelineService;

  const mockHttpService = { get: vi.fn(), patch: vi.fn(), post: vi.fn() };
  const mockConfigService = {
    API_KEY: 'test-key',
    API_URL: 'http://localhost:3001',
  };
  const mockLogger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const mockTranscriptionService = {
    extractAudio: vi.fn(),
    transcribe: vi.fn(),
  };
  const mockHighlightDetector = { detectHighlights: vi.fn() };
  const mockClipExtractor = { addCaptions: vi.fn(), extractClip: vi.fn() };

  beforeEach(() => {
    service = new (ClipperPipelineService as any)(
      mockHttpService,
      mockConfigService,
      mockLogger,
      mockTranscriptionService,
      mockHighlightDetector,
      mockClipExtractor,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildPipelineConfig', () => {
    it('should return defaults when project has no settings', () => {
      const project = { settings: null } as unknown as IClipProject;
      const result = (service as any).buildPipelineConfig(project);
      expect(result).toEqual(DEFAULT_PIPELINE_CONFIG);
    });

    it('should return defaults when project settings is undefined', () => {
      const project = {} as IClipProject;
      const result = (service as any).buildPipelineConfig(project);
      expect(result).toEqual(DEFAULT_PIPELINE_CONFIG);
    });

    it('should merge project settings over defaults', () => {
      const project = {
        settings: {
          addCaptions: false,
          aspectRatio: '16:9',
          captionStyle: 'bold',
          maxClips: 3,
          maxDuration: 60,
          minDuration: 20,
        },
      } as unknown as IClipProject;

      const result = (service as any).buildPipelineConfig(project);
      expect(result.minClipDuration).toBe(20);
      expect(result.maxClipDuration).toBe(60);
      expect(result.maxClips).toBe(3);
      expect(result.aspectRatio).toBe('16:9');
      expect(result.captionStyle).toBe('bold');
      expect(result.addCaptions).toBe(false);
      expect(result.llmModel).toBe(DEFAULT_PIPELINE_CONFIG.llmModel);
    });

    it('should use defaults for null individual settings', () => {
      const project = {
        settings: {
          addCaptions: null,
          aspectRatio: null,
          captionStyle: null,
          maxClips: null,
          maxDuration: 60,
          minDuration: null,
        },
      } as unknown as IClipProject;

      const result = (service as any).buildPipelineConfig(project);
      expect(result.minClipDuration).toBe(
        DEFAULT_PIPELINE_CONFIG.minClipDuration,
      );
      expect(result.maxClipDuration).toBe(60);
      expect(result.maxClips).toBe(DEFAULT_PIPELINE_CONFIG.maxClips);
      expect(result.aspectRatio).toBe(DEFAULT_PIPELINE_CONFIG.aspectRatio);
      expect(result.captionStyle).toBe(DEFAULT_PIPELINE_CONFIG.captionStyle);
      expect(result.addCaptions).toBe(DEFAULT_PIPELINE_CONFIG.addCaptions);
    });

    it('should preserve llmModel from defaults', () => {
      const project = {
        settings: {
          addCaptions: true,
          aspectRatio: '9:16',
          captionStyle: 'default',
          maxClips: 5,
          maxDuration: 45,
          minDuration: 10,
        },
      } as unknown as IClipProject;

      const result = (service as any).buildPipelineConfig(project);
      expect(result.llmModel).toBe('deepseek/deepseek-chat');
    });
  });

  describe('formatSrtTimestamp', () => {
    it('should format 0 seconds', () => {
      const result = (service as any).formatSrtTimestamp(0);
      expect(result).toBe('00:00:00,000');
    });

    it('should format seconds only', () => {
      const result = (service as any).formatSrtTimestamp(5);
      expect(result).toBe('00:00:05,000');
    });

    it('should format minutes and seconds', () => {
      const result = (service as any).formatSrtTimestamp(125);
      expect(result).toBe('00:02:05,000');
    });

    it('should format hours, minutes, and seconds', () => {
      const result = (service as any).formatSrtTimestamp(3661);
      expect(result).toBe('01:01:01,000');
    });

    it('should format fractional seconds as milliseconds', () => {
      const result = (service as any).formatSrtTimestamp(1.5);
      expect(result).toBe('00:00:01,500');
    });

    it('should handle small fractional values', () => {
      const result = (service as any).formatSrtTimestamp(0.25);
      expect(result).toBe('00:00:00,250');
    });

    it('should pad all components correctly', () => {
      const result = (service as any).formatSrtTimestamp(3723.456);
      expect(result).toBe('01:02:03,456');
    });
  });

  describe('generateClipSrt', () => {
    const segments = [
      { end: 15, start: 10, text: 'First segment' },
      { end: 20, start: 15, text: 'Second segment' },
      { end: 25, start: 20, text: 'Third segment' },
      { end: 35, start: 30, text: 'Fourth segment' },
      { end: 45, start: 40, text: 'Fifth segment' },
    ];

    it('should generate SRT for segments within clip range', () => {
      const result = (service as any).generateClipSrt(segments, 10, 25);
      const lines = result.split('\n\n');
      expect(lines).toHaveLength(3);
    });

    it('should use relative timestamps from clip start', () => {
      const result = (service as any).generateClipSrt(segments, 10, 25);
      expect(result).toContain('00:00:00,000 --> 00:00:05,000');
      expect(result).toContain('00:00:05,000 --> 00:00:10,000');
      expect(result).toContain('00:00:10,000 --> 00:00:15,000');
    });

    it('should number segments sequentially starting at 1', () => {
      const result = (service as any).generateClipSrt(segments, 10, 25);
      const entries = result.split('\n\n');
      expect(entries[0]).toMatch(/^1\n/);
      expect(entries[1]).toMatch(/^2\n/);
      expect(entries[2]).toMatch(/^3\n/);
    });

    it('should include trimmed text content', () => {
      const segmentsWithSpaces = [
        { end: 15, start: 10, text: '  Hello world  ' },
      ];
      const result = (service as any).generateClipSrt(
        segmentsWithSpaces,
        10,
        25,
      );
      expect(result).toContain('Hello world');
      expect(result).not.toContain('  Hello world  ');
    });

    it('should return empty string when no segments fall in range', () => {
      const result = (service as any).generateClipSrt(segments, 50, 60);
      expect(result).toBe('');
    });

    it('should exclude segments that partially overlap the clip range', () => {
      const result = (service as any).generateClipSrt(segments, 12, 22);
      const entries = result.split('\n\n').filter(Boolean);
      expect(entries).toHaveLength(1);
      expect(result).toContain('Second segment');
      expect(result).not.toContain('First segment');
      expect(result).not.toContain('Third segment');
    });

    it('should handle empty segments array', () => {
      const result = (service as any).generateClipSrt([], 0, 30);
      expect(result).toBe('');
    });
  });
});
