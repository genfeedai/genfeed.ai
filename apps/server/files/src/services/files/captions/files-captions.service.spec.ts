import { ConfigService } from '@files/config/config.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('FilesCaptionsService', () => {
  let service: FilesCaptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesCaptionsService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<FilesCaptionsService>(FilesCaptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('parses srt content', () => {
    const srt = `1\n00:00:00,000 --> 00:00:01,500\nHello world`;
    const words = service.filterCaptions(srt);
    expect(words).toEqual([
      { end: 750, start: 0, text: 'HELLO' },
      { end: 1500, start: 750, text: 'WORLD' },
    ]);
  });

  it('splits captions into words with timing', () => {
    const srt = `1\n00:00:00,000 --> 00:00:02,000\nHello world`;
    const words = service.filterCaptionsByWord(srt);
    expect(words).toEqual([
      { end: 1000, start: 0, text: 'HELLO' },
      { end: 2000, start: 1000, text: 'WORLD' },
    ]);
  });
});
