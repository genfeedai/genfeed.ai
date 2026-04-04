import { ConfigService } from '@api/config/config.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type UploadedAudioFile = {
  buffer: Buffer;
  originalname?: string;
};

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('audio-data')),
    unlinkSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('audio-data')),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('WhisperService', () => {
  let service: WhisperService;
  let replicateMock: Record<string, ReturnType<typeof vi.fn>>;
  let httpServiceMock: Record<string, ReturnType<typeof vi.fn>>;
  let fileQueueMock: Record<string, ReturnType<typeof vi.fn>>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(async () => {
    replicateMock = {
      transcribeAudio: vi.fn().mockResolvedValue({
        duration: 5,
        language: 'en',
        segments: [{ end: 5, start: 0, text: 'Hello world' }],
        text: 'Hello world',
      }),
    };
    httpServiceMock = {
      get: vi.fn().mockReturnValue(of({ data: Buffer.from('video-data') })),
    };
    fileQueueMock = {
      processVideo: vi.fn().mockResolvedValue({ jobId: 'job-123' }),
      waitForJob: vi.fn().mockResolvedValue({
        success: true,
        url: 'https://cdn.example.com/audio.mp3',
      }),
    };
    logger = createMockLogger();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhisperService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('test-endpoint'),
            ingredientsEndpoint: 'https://api.test.com',
          },
        },
        { provide: LoggerService, useValue: logger },
        { provide: FileQueueService, useValue: fileQueueMock },
        { provide: HttpService, useValue: httpServiceMock },
        { provide: ReplicateService, useValue: replicateMock },
      ],
    }).compile();

    service = module.get<WhisperService>(WhisperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('transcribeAudio', () => {
    it('should transcribe audio from a file buffer', async () => {
      const file = {
        buffer: Buffer.from('audio-data'),
        originalname: 'test.mp3',
      } as UploadedAudioFile;

      const result = await service.transcribeAudio(file);
      expect(result).toBe('Hello world');
      expect(replicateMock.transcribeAudio).toHaveBeenCalledWith({
        audio: {
          data: file.buffer,
          filename: 'test.mp3',
          type: 'buffer',
        },
      });
    });

    it('should use default filename when originalname is empty', async () => {
      const file = {
        buffer: Buffer.from('audio-data'),
        originalname: '',
      } as UploadedAudioFile;

      await service.transcribeAudio(file);
      expect(replicateMock.transcribeAudio).toHaveBeenCalledWith({
        audio: {
          data: file.buffer,
          filename: 'audio.mp3',
          type: 'buffer',
        },
      });
    });

    it('should propagate errors from replicate service', async () => {
      replicateMock.transcribeAudio.mockRejectedValue(
        new Error('Replicate API error'),
      );

      const file = {
        buffer: Buffer.from('audio-data'),
        originalname: 'test.mp3',
      } as UploadedAudioFile;

      await expect(service.transcribeAudio(file)).rejects.toThrow(
        'Replicate API error',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('transcribeUrl', () => {
    it('should transcribe audio from a URL', async () => {
      const result = await service.transcribeUrl(
        'https://example.com/audio.mp3',
      );
      expect(result).toEqual({
        duration: 5,
        language: 'en',
        segments: [{ end: 5, start: 0, text: 'Hello world' }],
        srt: expect.stringContaining('Hello world'),
        text: 'Hello world',
      });
    });

    it('should generate SRT with segments', async () => {
      replicateMock.transcribeAudio.mockResolvedValue({
        duration: 10,
        language: 'en',
        segments: [
          { end: 5, start: 0, text: 'Hello' },
          { end: 10, start: 5, text: 'World' },
        ],
        text: 'Hello World',
      });

      const result = await service.transcribeUrl(
        'https://example.com/audio.mp3',
      );
      expect(result.srt).toContain('1\n00:00:00,000 --> 00:00:05,000\nHello');
      expect(result.srt).toContain('2\n00:00:05,000 --> 00:00:10,000\nWorld');
    });

    it('should fallback to single SRT entry when no segments', async () => {
      replicateMock.transcribeAudio.mockResolvedValue({
        duration: 3,
        language: 'en',
        segments: [],
        text: 'Short clip',
      });

      const result = await service.transcribeUrl(
        'https://example.com/audio.mp3',
      );
      expect(result.srt).toContain('Short clip');
    });

    it('should pass language parameter', async () => {
      await service.transcribeUrl('https://example.com/audio.mp3', 'fr');
      expect(replicateMock.transcribeAudio).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'fr' }),
      );
    });

    it('should propagate HTTP errors', async () => {
      const { throwError } = await import('rxjs');
      httpServiceMock.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      await expect(
        service.transcribeUrl('https://example.com/audio.mp3'),
      ).rejects.toThrow('Network error');
    });
  });

  describe('generateCaptions', () => {
    it('should throw when video download fails', async () => {
      httpServiceMock.get.mockImplementation(() => {
        throw new Error('Download failed');
      });

      await expect(service.generateCaptions('ingredient-123')).rejects.toThrow(
        'Unable to download video',
      );
    });
  });
});
