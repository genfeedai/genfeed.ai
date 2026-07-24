import { MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/enums';
import { BaseApiClient } from './base-api-client';

describe('BaseApiClient MCP origin proof', () => {
  it('keeps the service proof when a caller bearer token is installed', () => {
    const instance = {
      defaults: {
        headers: {} as Record<string, string>,
      },
    };
    const httpService = {
      axiosRef: {
        create: vi.fn(({ headers }: { headers: Record<string, string> }) => {
          instance.defaults.headers = { ...headers };
          return instance;
        }),
      },
    };
    const configService = {
      get: vi.fn((key: string) =>
        key === 'GENFEEDAI_API_KEY'
          ? 'internal-service-key'
          : 'https://api.genfeed.ai',
      ),
    };
    const logger = {
      error: vi.fn(),
    };
    const client = new BaseApiClient(
      logger as never,
      httpService as never,
      configService as never,
    );

    client.setBearerToken('gf_live_per_user_oauth_token');

    expect(instance.defaults.headers.Authorization).toBe(
      'Bearer gf_live_per_user_oauth_token',
    );
    expect(instance.defaults.headers[MCP_ACTION_ORIGIN_PROOF_HEADER]).toBe(
      'Qr4bP6k-qVZGg3vfc9dLxHTynsF-ZfeCH_0bjXWLlaA',
    );
  });
});
