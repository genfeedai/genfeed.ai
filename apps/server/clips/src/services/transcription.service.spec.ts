import { ConfigService } from '@clips/config/config.service';
import { TranscriptionService } from '@clips/services/transcription.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';

vi.mock('@nestjs/axios');

describe('TranscriptionService', () => {
  let service: TranscriptionService;
  let httpService: vi.Mocked<HttpService>;
  let loggerService: vi.Mocked<LoggerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranscriptionService,
        {
          provide: HttpService,
          useValue: {
            get: vi.fn(),
            post: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            API_KEY: 'test-api-key',
            API_URL: 'http://api.test',
            FILES_URL: 'http://files.test',
          },
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

    service = module.get<TranscriptionService>(TranscriptionService);
    httpService = module.get(HttpService);
    loggerService = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractAudio', () => {
    const jobId = 'audio-job-1';
    const audioUrl = 'https://cdn.test/audio.mp3';

    function setupSuccessfulAudioExtraction() {
      httpService.post.mockReturnValue(
        of({ data: { jobId } }) as ReturnType<typeof httpService.post>,
      );
      httpService.get.mockReturnValue(
        of({
          data: { result: { outputUrl: audioUrl }, status: 'completed' },
        }) as ReturnType<typeof httpService.get>,
      );
    }

    it('should extract audio and return url and jobId', async () => {
      setupSuccessfulAudioExtraction();

      const result = await service.extractAudio(
        'https://video.test/source.mp4',
        'user-1',
        'org-1',
      );

      expect(result.audioUrl).toBe(audioUrl);
      expect(result.jobId).toBe(jobId);
    });

    it('should post to files service with video-to-audio type', async () => {
      setupSuccessfulAudioExtraction();

      await service.extractAudio(
        'https://video.test/source.mp4',
        'user-1',
        'org-1',
      );

      expect(httpService.post).toHaveBeenCalledWith(
        'http://files.test/v1/files/process/video',
        expect.objectContaining({
          organizationId: 'org-1',
          params: { inputPath: 'https://video.test/source.mp4' },
          type: 'video-to-audio',
          userId: 'user-1',
        }),
        expect.any(Object),
      );
    });

    it('should use nested jobId from response data wrapper', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: { jobId: 'nested-job' } } }) as ReturnType<
          typeof httpService.post
        >,
      );
      httpService.get.mockReturnValue(
        of({
          data: { result: { outputUrl: audioUrl }, status: 'completed' },
        }) as ReturnType<typeof httpService.get>,
      );

      const result = await service.extractAudio(
        'https://video.test/source.mp4',
        'user-1',
        'org-1',
      );

      expect(result.jobId).toBe('nested-job');
    });

    it('should throw when audio extraction job fails', async () => {
      httpService.post.mockReturnValue(
        of({ data: { jobId } }) as ReturnType<typeof httpService.post>,
      );
      httpService.get.mockReturnValue(
        of({
          data: { error: 'FFmpeg failed', status: 'failed' },
        }) as ReturnType<typeof httpService.get>,
      );

      await expect(
        service.extractAudio(
          'https://video.test/source.mp4',
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow(`Job ${jobId} failed: FFmpeg failed`);
    });

    it('should throw and log if HTTP post fails', async () => {
      const error = new Error('Connection refused');
      httpService.post.mockReturnValue(
        throwError(() => error) as ReturnType<typeof httpService.post>,
      );

      await expect(
        service.extractAudio(
          'https://video.test/source.mp4',
          'user-1',
          'org-1',
        ),
      ).rejects.toThrow('Connection refused');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('transcribe', () => {
    const mockTranscriptionData = {
      duration: 120,
      language: 'en',
      segments: [
        { end: 5, start: 0, text: 'Hello world' },
        { end: 12, start: 5, text: 'This is a test' },
      ],
      srt: '1\n00:00:00,000 --> 00:00:05,000\nHello world',
      text: 'Hello world This is a test',
    };

    it('should transcribe audio and return full result', async () => {
      httpService.post.mockReturnValue(
        of({ data: mockTranscriptionData }) as ReturnType<
          typeof httpService.post
        >,
      );

      const result = await service.transcribe('https://cdn.test/audio.mp3');

      expect(result.text).toBe(mockTranscriptionData.text);
      expect(result.srt).toBe(mockTranscriptionData.srt);
      expect(result.language).toBe('en');
      expect(result.duration).toBe(120);
      expect(result.segments).toHaveLength(2);
    });

    it('should unwrap nested data wrapper in response', async () => {
      httpService.post.mockReturnValue(
        of({ data: { data: mockTranscriptionData } }) as ReturnType<
          typeof httpService.post
        >,
      );

      const result = await service.transcribe('https://cdn.test/audio.mp3');

      expect(result.text).toBe(mockTranscriptionData.text);
    });

    it('should use default language en if not provided', async () => {
      httpService.post.mockReturnValue(
        of({ data: mockTranscriptionData }) as ReturnType<
          typeof httpService.post
        >,
      );

      await service.transcribe('https://cdn.test/audio.mp3');

      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/speech/transcribe/url'),
        expect.objectContaining({ language: 'en' }),
        expect.any(Object),
      );
    });

    it('should pass custom language to transcription endpoint', async () => {
      httpService.post.mockReturnValue(
        of({ data: mockTranscriptionData }) as ReturnType<
          typeof httpService.post
        >,
      );

      await service.transcribe('https://cdn.test/audio.mp3', 'fr');

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          language: 'fr',
          url: 'https://cdn.test/audio.mp3',
        }),
        expect.any(Object),
      );
    });

    it('should use Bearer authorization header', async () => {
      httpService.post.mockReturnValue(
        of({ data: mockTranscriptionData }) as ReturnType<
          typeof httpService.post
        >,
      );

      await service.transcribe('https://cdn.test/audio.mp3');

      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
    });

    it('should throw and log error if transcription fails', async () => {
      const error = new Error('Transcription timeout');
      httpService.post.mockReturnValue(
        throwError(() => error) as ReturnType<typeof httpService.post>,
      );

      await expect(
        service.transcribe('https://cdn.test/audio.mp3'),
      ).rejects.toThrow('Transcription timeout');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
