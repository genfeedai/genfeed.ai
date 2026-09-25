import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBrandContextService } from './agent-brand-context.service';

const getMock = vi.fn();

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    instance = { get: getMock };

    constructor(_baseUrl?: string, _token?: string) {}

    static getBaseServiceInstance<T>(
      ServiceClass: new (...args: unknown[]) => T,
      ...args: unknown[]
    ): T {
      return new ServiceClass(...args);
    }
  }

  return { HTTPBaseService: MockHTTPBaseService };
});

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.example' },
}));

describe('AgentBrandContextService', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('fetches and deserializes the brand context snapshot', async () => {
    getMock.mockResolvedValue({
      data: {
        data: {
          attributes: { brandName: 'Acme', systemPrompt: 'prompt' },
          id: 'brand-1',
          type: 'agent-brand-context',
        },
      },
    });
    const controller = new AbortController();

    const snapshot = await AgentBrandContextService.getInstance(
      'token',
    ).getSnapshot('brand-1', {
      query: '  launch week ',
      signal: controller.signal,
    });

    expect(getMock).toHaveBeenCalledWith('/brands/brand-1/agent-context', {
      params: { query: 'launch week' },
      signal: controller.signal,
    });
    expect(snapshot).toEqual(
      expect.objectContaining({
        brandName: 'Acme',
        id: 'brand-1',
        systemPrompt: 'prompt',
      }),
    );
  });

  it('omits an empty preview query', async () => {
    getMock.mockResolvedValue({
      data: { data: { attributes: {}, id: 'brand-1', type: 'x' } },
    });

    await AgentBrandContextService.getInstance('token').getSnapshot('brand-1');

    expect(getMock).toHaveBeenCalledWith('/brands/brand-1/agent-context', {
      params: undefined,
      signal: undefined,
    });
  });
});
