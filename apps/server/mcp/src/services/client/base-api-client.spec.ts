import { MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/contracts';
import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import { isMcpToolRefusal } from '@mcp/tools/mcp-tool-error';
import { BaseApiClient } from './base-api-client';

function createClient() {
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
      key === 'GENFEEDAI_API_KEY' ? 'internal-service-key' : undefined,
    ),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const client = new BaseApiClient(
    logger as never,
    httpService as never,
    configService as never,
  );

  return { client, instance, logger };
}

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
      warn: vi.fn(),
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

describe('BaseApiClient client attribution', () => {
  it('declares the end client unknown on every API call', () => {
    const { client, instance } = createClient();

    expect(instance.defaults.headers[UNATTRIBUTED_FORWARDED_HEADER]).toBe(
      UNATTRIBUTED_FORWARDED_VALUE,
    );

    client.setBearerToken('gf_live_per_user_oauth_token');
    expect(instance.defaults.headers[UNATTRIBUTED_FORWARDED_HEADER]).toBe(
      UNATTRIBUTED_FORWARDED_VALUE,
    );

    client.setBearerToken('');
    expect(instance.defaults.headers[UNATTRIBUTED_FORWARDED_HEADER]).toBe(
      UNATTRIBUTED_FORWARDED_VALUE,
    );
  });
});

describe('BaseApiClient failure logging', () => {
  it.each([400, 404, 409, 429])(
    'logs a %s refusal from the API as a warning',
    (status) => {
      const { client, logger } = createClient();

      client.logError('creating scheduled release', {
        message: `Request failed with status code ${status}`,
        response: { data: {}, status },
      } as never);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      message: 'Request failed with status code 502',
      response: { status: 502 },
    },
    { message: 'socket hang up' },
  ])('logs $message as an error', (failure) => {
    const { client, logger } = createClient();

    client.logError('creating scheduled release', failure as never);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('BaseApiClient failWith', () => {
  it('keeps the upstream status so a 4xx is a refusal, with the fixed message', () => {
    const { client } = createClient();
    const fail = client.failWith('Failed to list Editor projects');

    let thrown: unknown;
    try {
      fail({
        message: 'Request failed with status code 404',
        response: {
          data: { errors: [{ detail: 'secret detail' }] },
          status: 404,
        },
      } as never);
    } catch (error) {
      thrown = error;
    }

    expect(isMcpToolRefusal(thrown)).toBe(true);
    expect((thrown as Error).message).toBe('Failed to list Editor projects');
  });

  it('keeps a 5xx a server fault', () => {
    const { client } = createClient();
    const fail = client.failWith('Failed to list Editor projects');

    let thrown: unknown;
    try {
      fail({ message: 'bad gateway', response: { status: 502 } } as never);
    } catch (error) {
      thrown = error;
    }

    expect(isMcpToolRefusal(thrown)).toBe(false);
  });
});
