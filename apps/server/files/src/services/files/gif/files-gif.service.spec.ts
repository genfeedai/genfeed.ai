import { ConfigService } from '@files/config/config.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesGifService } from '@files/services/files/gif/files-gif.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('FilesGifService', () => {
  let service: FilesGifService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        FilesGifService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: FilesService, useValue: {} },
        { provide: FilesCaptionsService, useValue: {} },
        { provide: FilesKenBurnsEffectService, useValue: {} },
      ],
    }).compile();

    service = module.get<FilesGifService>(FilesGifService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
