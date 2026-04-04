import { ConfigService } from '@files/config/config.service';
import { FilesSplitScreenService } from '@files/services/files/split/files-split-screen.service';
import { LoggerService } from '@libs/logger/logger.service';
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
      ],
    }).compile();

    service = module.get<FilesSplitScreenService>(FilesSplitScreenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
