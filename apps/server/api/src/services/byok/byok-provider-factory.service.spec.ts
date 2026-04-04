import { ByokService } from '@api/services/byok/byok.service';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { ByokProvider } from '@genfeedai/enums';

describe('ByokProviderFactoryService', () => {
  let service: ByokProviderFactoryService;

  const mockByokService = {
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    resolveApiKey: vi.fn(),
  } as unknown as ByokService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ByokProviderFactoryService(mockByokService);
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

    const result = await service.resolveProvider('org-1', ByokProvider.OPENAI);

    expect(result.source).toBe('hosted');
    expect(result.apiKey).toBeUndefined();
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
