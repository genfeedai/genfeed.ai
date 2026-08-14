import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { ConfigService } from '@libs/config/config.service';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';

describe('AgentToolInternalApiService', () => {
  const context: ToolExecutionContext = {
    authToken: 'token-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };

  const createService = (apiUrl?: string) => {
    const configService = {
      get: vi.fn((key: string) =>
        key === 'GENFEEDAI_API_URL' ? apiUrl : undefined,
      ),
    } as unknown as ConfigService;
    const httpService = {
      delete: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
    } as unknown as HttpService;

    return {
      configService,
      httpService,
      service: new AgentToolInternalApiService(configService, httpService),
    };
  };

  it('uses the canonical Genfeed API URL for internal generation requests', async () => {
    const { configService, httpService, service } = createService(
      'https://api.genfeed.localhost/',
    );
    vi.mocked(httpService.post).mockReturnValue(
      of({ data: { data: { id: 'image-1' } } }) as never,
    );

    await service.callInternalApi(
      'POST',
      '/v1/images',
      { prompt: 'test' },
      context,
    );

    expect(configService.get).toHaveBeenCalledWith('GENFEEDAI_API_URL');
    expect(httpService.post).toHaveBeenCalledWith(
      'https://api.genfeed.localhost/v1/images',
      { prompt: 'test' },
      {
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
      },
    );
  });

  it('falls back to the local API port when no URL is configured', async () => {
    const { httpService, service } = createService();
    vi.mocked(httpService.get).mockReturnValue(of({ data: {} }) as never);

    await service.callInternalApi('GET', '/v1/health', undefined, context);

    expect(httpService.get).toHaveBeenCalledWith(
      'http://localhost:3010/v1/health',
      expect.any(Object),
    );
  });

  it('uses canonical organization filters for internal collection lookups', async () => {
    const { httpService, service } = createService(
      'https://api.genfeed.localhost',
    );
    vi.mocked(httpService.get).mockReturnValue(
      of({ data: { data: [{ id: 'workflow-1' }] } }) as never,
    );

    await service.callInternalFindOne('/v1/workflows', 'org-1', 'token-1');

    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.genfeed.localhost/v1/workflows',
      {
        headers: { Authorization: 'Bearer token-1' },
        params: {
          'filters[isDeleted]': false,
          'filters[organizationId]': 'org-1',
          'pagination[pageSize]': 1,
        },
      },
    );
  });

  it('rethrows JSON:API 403 details instead of a bare axios status', async () => {
    const { httpService, service } = createService(
      'https://api.genfeed.localhost',
    );
    vi.mocked(httpService.post).mockReturnValue(
      throwError(() => ({
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          data: {
            errors: [
              {
                detail: 'Model not enabled for this organization',
                title: 'Forbidden',
              },
            ],
          },
          status: 403,
        },
      })),
    );

    await expect(
      service.callInternalApi(
        'POST',
        '/v1/images',
        { model: 'genfeed-ai/flux-dev' },
        context,
      ),
    ).rejects.toThrow(
      'Request failed with status code 403: Model not enabled for this organization',
    );
  });

  it('returns null when an internal collection lookup fails', async () => {
    const { httpService, service } = createService(
      'https://api.genfeed.localhost',
    );
    vi.mocked(httpService.get).mockReturnValue(
      throwError(() => new Error('unavailable')),
    );

    await expect(
      service.callInternalFindOne('/v1/workflows', 'org-1'),
    ).resolves.toBeNull();
  });
});
