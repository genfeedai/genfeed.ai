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
      { headers: { 'x-api-key': 'argil-key' }, timeout: 15_000 },
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

describe('ByokService OpenRouter validation', () => {
  const httpService = { post: vi.fn() };
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

  it('posts zdr and deny data_collection on first-party validation', async () => {
    httpService.post.mockReturnValue(of({ data: {} }));

    await expect(
      service.validateKey(ByokProvider.OPENROUTER, 'or-key'),
    ).resolves.toEqual({ isValid: true });

    expect(httpService.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        provider: { data_collection: 'deny', zdr: true },
      }),
      { headers: { Authorization: 'Bearer or-key' } },
    );
  });

  it('returns invalid-key copy for 401 responses', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({
        response: { status: 401, data: { error: { message: 'Unauthorized' } } },
      })),
    );

    await expect(
      service.validateKey(ByokProvider.OPENROUTER, 'bad-key'),
    ).resolves.toEqual({
      error: 'Invalid OpenRouter API key',
      isValid: false,
    });
  });

  it('reports a first-party routing reject without calling the key invalid', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({
        response: {
          data: {
            error: {
              message: 'No endpoints found matching your data policy',
            },
          },
          status: 404,
        },
      })),
    );

    await expect(
      service.validateKey(ByokProvider.OPENROUTER, 'valid-key'),
    ).resolves.toEqual({
      error:
        'OpenRouter rejected the key under first-party routing (zdr / no data collection)',
      isValid: false,
    });
  });
});
