import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/enums';
import { of, throwError } from 'rxjs';

describe('ByokService Argil validation', () => {
  const httpService = { get: vi.fn() };
  const logger = { error: vi.fn() };
  const service = new ByokService(
    {} as never,
    httpService as never,
    logger as never,
    {} as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates an Argil key against the avatars endpoint', async () => {
    httpService.get.mockReturnValue(of({ data: [] }));

    await expect(
      service.validateKey(ByokProvider.ARGIL, 'argil-key'),
    ).resolves.toEqual({ isValid: true });
    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.argil.ai/v1/avatars',
      { headers: { 'x-api-key': 'argil-key' } },
    );
  });

  it('rejects an invalid Argil key', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('unauthorized')),
    );

    await expect(
      service.validateKey(ByokProvider.ARGIL, 'invalid-key'),
    ).resolves.toEqual({ error: 'Invalid Argil API key', isValid: false });
  });
});
