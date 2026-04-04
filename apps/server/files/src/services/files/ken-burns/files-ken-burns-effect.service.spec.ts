import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('FilesKenBurnsEffectService', () => {
  let service: FilesKenBurnsEffectService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesKenBurnsEffectService,
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        { provide: FilesService, useValue: {} },
        { provide: FilesCaptionsService, useValue: {} },
      ],
    }).compile();

    service = module.get<FilesKenBurnsEffectService>(
      FilesKenBurnsEffectService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
