import { AvatarVideoService } from '@api/services/avatar-video/avatar-video.service';
import type {
  AvatarVideoProvider,
  AvatarVideoProviderName,
} from '@api/services/avatar-video/avatar-video-provider.interface';
import { DidAvatarProvider } from '@api/services/avatar-video/providers/did-avatar.provider';
import { HeygenAvatarProvider } from '@api/services/avatar-video/providers/heygen-avatar.provider';
import { MusetalkAvatarProvider } from '@api/services/avatar-video/providers/musetalk-avatar.provider';
import { TavusAvatarProvider } from '@api/services/avatar-video/providers/tavus-avatar.provider';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

const makeProvider = (): vi.Mocked<AvatarVideoProvider> => ({
  generate: vi.fn(),
});

describe('AvatarVideoService', () => {
  let service: AvatarVideoService;
  let heygenProvider: vi.Mocked<AvatarVideoProvider>;
  let didProvider: vi.Mocked<AvatarVideoProvider>;
  let tavusProvider: vi.Mocked<AvatarVideoProvider>;
  let musetalkProvider: vi.Mocked<AvatarVideoProvider>;
  let logger: {
    warn: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    heygenProvider = makeProvider();
    didProvider = makeProvider();
    tavusProvider = makeProvider();
    musetalkProvider = makeProvider();
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvatarVideoService,
        { provide: HeygenAvatarProvider, useValue: heygenProvider },
        { provide: DidAvatarProvider, useValue: didProvider },
        { provide: TavusAvatarProvider, useValue: tavusProvider },
        { provide: MusetalkAvatarProvider, useValue: musetalkProvider },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<AvatarVideoService>(AvatarVideoService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProvider', () => {
    it('should return heygen provider when name is heygen', () => {
      expect(service.getProvider('heygen')).toBe(heygenProvider);
    });

    it('should return did provider when name is did', () => {
      expect(service.getProvider('did')).toBe(didProvider);
    });

    it('should return tavus provider when name is tavus', () => {
      expect(service.getProvider('tavus')).toBe(tavusProvider);
    });

    it('should return musetalk provider when name is musetalk', () => {
      expect(service.getProvider('musetalk')).toBe(musetalkProvider);
    });

    it('should default to heygen when no name supplied', () => {
      expect(service.getProvider()).toBe(heygenProvider);
    });

    it('should fallback to heygen for unknown provider name and log a warning', () => {
      const result = service.getProvider('unknown' as AvatarVideoProviderName);

      expect(result).toBe(heygenProvider);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown'),
      );
    });

    it('should not log a warning for known providers', () => {
      service.getProvider('heygen');
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('getSupportedProviders', () => {
    it('should return all four provider names', () => {
      const providers = service.getSupportedProviders();
      expect(providers).toHaveLength(4);
      expect(providers).toContain('heygen');
      expect(providers).toContain('did');
      expect(providers).toContain('tavus');
      expect(providers).toContain('musetalk');
    });

    it('should return an array of strings', () => {
      const providers = service.getSupportedProviders();
      providers.forEach((p) => expect(typeof p).toBe('string'));
    });
  });
});
