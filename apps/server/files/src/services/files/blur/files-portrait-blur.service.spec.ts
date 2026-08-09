import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesPortraitBlurService } from '@files/services/files/blur/files-portrait-blur.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('FilesPortraitBlurService', () => {
  let service: FilesPortraitBlurService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesPortraitBlurService,
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

    service = module.get<FilesPortraitBlurService>(FilesPortraitBlurService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
