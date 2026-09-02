import { ApiKeyCategory } from '@genfeedai/enums';
import type { ConfigService } from '@libs/config/config.service';
import { ApiKeyHelperService } from './api-key-helper.service';

describe('ApiKeyHelperService', () => {
  const get = vi.fn();
  const configService = { get } as unknown as ConfigService;
  const service = new ApiKeyHelperService(configService);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [ApiKeyCategory.ELEVENLABS, 'ELEVENLABS_API_KEY'],
    [ApiKeyCategory.GENFEEDAI, 'GENFEEDAI_API_KEY'],
    [ApiKeyCategory.HEDRA, 'HEDRA_KEY'],
    [ApiKeyCategory.HEYGEN, 'HEYGEN_KEY'],
    [ApiKeyCategory.OPUS_PRO, 'OPUS_PRO_KEY'],
  ])('reads %s from the %s environment variable', (provider, envVar) => {
    get.mockReturnValue('secret-value');

    expect(service.getApiKey(provider)).toBe('secret-value');
    expect(get).toHaveBeenCalledWith(envVar);
  });

  it('returns an empty string when the configured key is missing', () => {
    get.mockReturnValue(undefined);

    expect(service.getApiKey(ApiKeyCategory.HEYGEN)).toBe('');
    expect(service.getApiKey(ApiKeyCategory.ELEVENLABS)).toBe('');
  });

  it('returns an empty string for a provider with no mapped variable', () => {
    get.mockReturnValue('secret-value');

    expect(service.getApiKey('unmapped-provider' as ApiKeyCategory)).toBe('');
    expect(get).not.toHaveBeenCalled();
  });
});
