import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesSplitScreenService } from '@files/services/files/split/files-split-screen.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('FilesSplitScreenService', () => {
  let service: FilesSplitScreenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesSplitScreenService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        { provide: FFmpegService, useValue: {} },
      ],
    }).compile();

    service = module.get<FilesSplitScreenService>(FilesSplitScreenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
