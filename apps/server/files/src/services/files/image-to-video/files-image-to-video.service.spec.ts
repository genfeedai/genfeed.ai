import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesImageToVideoService } from '@files/services/files/image-to-video/files-image-to-video.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';

describe('FilesImageToVideoService', () => {
  let service: FilesImageToVideoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesImageToVideoService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        { provide: HttpService, useValue: {} },
        {
          provide: FFmpegService,
          useValue: {
            addAudioAndTextToVideo: vi.fn(),
            mergeVideosWithMusic: vi.fn(),
            scaleVideo: vi.fn(),
          },
        },
        { provide: FilesCaptionsService, useValue: {} },
      ],
    }).compile();

    service = module.get<FilesImageToVideoService>(FilesImageToVideoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
