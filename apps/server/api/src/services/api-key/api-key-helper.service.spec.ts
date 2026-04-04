import { ConfigService } from '@api/config/config.service';
import { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import { ApiKeyCategory } from '@genfeedai/enums';

describe('ApiKeyHelperService', () => {
  let service: ApiKeyHelperService;
  let configService: vi.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: vi.fn(),
    } as unknown as vi.Mocked<ConfigService>;
    service = new ApiKeyHelperService(configService as ConfigService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getApiKey', () => {
    it('should return HEYGEN_KEY for heygen provider', () => {
      configService.get.mockReturnValue('heygen-api-key');

      const result = service.getApiKey(ApiKeyCategory.HEYGEN);

      expect(result).toBe('heygen-api-key');
      expect(configService.get).toHaveBeenCalledWith('HEYGEN_KEY');
    });

    it('should return ELEVENLABS_API_KEY for elevenlabs provider', () => {
      configService.get.mockImplementation((key: string) =>
        key === 'ELEVENLABS_API_KEY' ? 'elevenlabs-api-key' : undefined,
      );

      const result = service.getApiKey(ApiKeyCategory.ELEVENLABS);

      expect(result).toBe('elevenlabs-api-key');
      expect(configService.get).toHaveBeenCalledWith('ELEVENLABS_API_KEY');
    });

    it('should return HEDRA_KEY for hedra provider', () => {
      configService.get.mockReturnValue('hedra-api-key');

      const result = service.getApiKey(ApiKeyCategory.HEDRA);

      expect(result).toBe('hedra-api-key');
      expect(configService.get).toHaveBeenCalledWith('HEDRA_KEY');
    });

    it('should return OPUS_PRO_KEY for opuspro provider', () => {
      configService.get.mockReturnValue('opuspro-api-key');

      const result = service.getApiKey(ApiKeyCategory.OPUS_PRO);

      expect(result).toBe('opuspro-api-key');
      expect(configService.get).toHaveBeenCalledWith('OPUS_PRO_KEY');
    });

    it('should return empty string when env var is not set', () => {
      configService.get.mockReturnValue(undefined);

      const result = service.getApiKey(ApiKeyCategory.HEYGEN);

      expect(result).toBe('');
    });
  });
});
