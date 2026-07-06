import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ByokProvider } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';

describe('ByokProviderFactoryService', () => {
  let service: ByokProviderFactoryService;

  const mockByokService = {
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    resolveApiKey: vi.fn(),
  } as unknown as ByokService;

  const mockConfigService = {
    get: vi.fn(),
  } as unknown as ConfigService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ByokProviderFactoryService(
      mockByokService,
      mockConfigService,
    );
  });

  it('returns BYOK source and apiKey when key is configured', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue({
      apiKey: 'byok-openai-key',
      apiSecret: 'byok-openai-secret',
    });

    const result = await service.resolveProvider('org-1', ByokProvider.OPENAI);

    expect(mockByokService.resolveApiKey).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.OPENAI,
    );
    expect(result.source).toBe('byok');
    expect(result.apiKey).toBe('byok-openai-key');
    expect(result.apiSecret).toBe('byok-openai-secret');
  });

  it('falls back to hosted source when BYOK key is missing', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue(undefined);
    vi.mocked(mockConfigService.get).mockReturnValue(undefined);

    const result = await service.resolveProvider('org-1', ByokProvider.OPENAI);

    expect(result.source).toBe('hosted');
    expect(result.apiKey).toBeUndefined();
  });

  it('falls back to managed source when BYOK is missing and GENFEED_API_KEY is configured', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue(undefined);
    vi.mocked(mockConfigService.get).mockImplementation((key: string) => {
      if (key === 'GENFEED_API_KEY') return 'gf_live_managed';
      if (key === 'GENFEED_MANAGED_INFERENCE_URL') return '';
      if (key === 'GENFEEDAI_API_URL') return 'https://api.genfeed.ai';
      return undefined;
    });

    const result = await service.resolveProvider('org-1', ByokProvider.FAL);

    expect(result).toEqual({
      apiKey: 'gf_live_managed',
      managedInferenceUrl: 'https://api.genfeed.ai/v1/managed-inference',
      source: 'managed',
    });
    expect(mockByokService.incrementUsage).not.toHaveBeenCalled();
  });

  it('uses explicit managed inference URL when configured', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue(undefined);
    vi.mocked(mockConfigService.get).mockImplementation((key: string) => {
      if (key === 'GENFEED_API_KEY') return 'gf_live_managed';
      if (key === 'GENFEED_MANAGED_INFERENCE_URL') {
        return 'https://edge.test/managed';
      }
      return undefined;
    });

    const result = await service.resolveProvider('org-1', ByokProvider.FAL);

    expect(result.managedInferenceUrl).toBe('https://edge.test/managed');
  });

  it('tracks usage when BYOK key is found and trackUsage is true', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue({
      apiKey: 'byok-key',
    });

    await service.resolveProvider('org-1', ByokProvider.OPENAI, true);

    expect(mockByokService.incrementUsage).toHaveBeenCalledWith(
      'org-1',
      ByokProvider.OPENAI,
    );
  });

  it('does not track usage when trackUsage is false', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue({
      apiKey: 'byok-key',
    });

    await service.resolveProvider('org-1', ByokProvider.OPENAI, false);

    expect(mockByokService.incrementUsage).not.toHaveBeenCalled();
  });

  it('hasProviderAccess returns true for hosted provider', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue(undefined);

    const result = await service.hasProviderAccess(
      'org-1',
      ByokProvider.OPENAI,
    );

    expect(result).toBe(true);
  });

  it('hasProviderAccess returns true when BYOK key exists', async () => {
    vi.mocked(mockByokService.resolveApiKey).mockResolvedValue({
      apiKey: 'byok-key',
    });

    const result = await service.hasProviderAccess(
      'org-1',
      ByokProvider.OPENAI,
    );

    expect(result).toBe(true);
  });
});
