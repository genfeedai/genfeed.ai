import { FFmpegStreamService } from '@files/services/ffmpeg/stream/ffmpeg-stream.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock child_process
vi.mock('child_process');
// Mock ffmpeg-static
vi.mock('ffmpeg-static', () => '/usr/local/bin/ffmpeg');

describe('FFmpegStreamService', () => {
  let service: FFmpegStreamService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegStreamService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<FFmpegStreamService>(FFmpegStreamService);
    module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processVideoStream', () => {
    it('should be defined as a method', () => {
      expect(service.processVideoStream).toBeDefined();
      expect(typeof service.processVideoStream).toBe('function');
    });
  });
});
