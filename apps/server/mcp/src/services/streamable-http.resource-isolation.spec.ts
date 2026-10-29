import { McpResourceUri } from '@mcp/mcp/resource-catalog';
import { StreamableHttpService } from '@mcp/services/streamable-http.service';

interface FakeAxiosInstance {
  defaults: { headers: Record<string, string> };
  get: (url: string) => Promise<{ data: { data: Record<string, unknown> } }>;
}

/**
 * Real service, client and registry wired to a fake axios: proves two callers
 * reading a resource at the same time each reach the API with their own token.
 */
describe('StreamableHttpService.createToolRegistry', () => {
  function buildService() {
    const instances: FakeAxiosInstance[] = [];
    const callerSeenByApi: string[] = [];
    const httpService = {
      axiosRef: {
        create: (config: { headers: Record<string, string> }) => {
          const instance: FakeAxiosInstance = {
            defaults: { headers: { ...config.headers } },
            get: async () => {
              // Yield so a concurrent caller can overwrite a shared header.
              await new Promise((resolve) => setTimeout(resolve, 5));
              callerSeenByApi.push(instance.defaults.headers.Authorization);
              return { data: { data: {} } };
            },
          };
          instances.push(instance);
          return instance;
        },
      },
    };
    const logger = {
      debug: () => undefined,
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    };
    const configService = {
      get: (key: string) =>
        key === 'GENFEEDAI_API_URL' ? 'http://localhost:3010' : '',
    };

    const service = new StreamableHttpService(
      logger as never,
      httpService as never,
      configService as never,
      { instrumentServer: () => undefined } as never,
    );

    return { callerSeenByApi, instances, service };
  }

  it('keeps each concurrent resource read on its own caller token', async () => {
    const { callerSeenByApi, instances, service } = buildService();

    const registryA = service.createToolRegistry({ token: 'token-a' });
    const registryB = service.createToolRegistry({ token: 'token-b' });

    await Promise.all([
      registryA.handleResourceRead({ uri: McpResourceUri.VIDEO_ANALYTICS }),
      registryB.handleResourceRead({ uri: McpResourceUri.VIDEO_ANALYTICS }),
    ]);

    expect(instances).toHaveLength(2);
    expect([...callerSeenByApi].sort()).toEqual([
      'Bearer token-a',
      'Bearer token-b',
    ]);
  });

  it('does not carry a token from one registry to the next', () => {
    const { instances, service } = buildService();

    service.createToolRegistry({ token: 'token-a' });
    service.createToolRegistry({ token: 'token-b' });

    expect(instances.map((i) => i.defaults.headers.Authorization)).toEqual([
      'Bearer token-a',
      'Bearer token-b',
    ]);
  });
});
