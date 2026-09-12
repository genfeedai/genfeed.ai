import { AgentStudioHandoffService } from '@services/content/agent-studio-handoff.service';
import {
  clearAllServiceInstances,
  HTTPBaseService,
} from '@services/core/interceptor.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

describe('AgentStudioHandoffService', () => {
  beforeEach(() => {
    HTTPBaseService.clearAllInstances();
    vi.clearAllMocks();
  });

  it('returns the same cached instance for a repeated token', () => {
    const first = AgentStudioHandoffService.getInstance('token-a');
    const second = AgentStudioHandoffService.getInstance('token-a');

    expect(first).toBeInstanceOf(AgentStudioHandoffService);
    expect(second).toBe(first);
  });

  it('participates in the shared cache cleared on sign-out', () => {
    const before = AgentStudioHandoffService.getInstance('token-a');

    clearAllServiceInstances();

    const after = AgentStudioHandoffService.getInstance('token-a');
    expect(after).not.toBe(before);
  });

  it('resolves null for a missing, expired, already-consumed, or foreign handoff', async () => {
    const service = new AgentStudioHandoffService('token-a');
    const mockGet = vi.fn().mockResolvedValue({ data: null, status: 404 });
    const serviceWithMockedInstance = service as unknown as {
      instance: { get: typeof mockGet };
    };
    serviceWithMockedInstance.instance.get = mockGet;

    const result = await service.consume('handoff-1');

    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/agent/studio-handoff/handoff-1', {
      signal: undefined,
      validateStatus: expect.any(Function),
    });

    const requestConfig = mockGet.mock.calls[0]?.[1] as {
      validateStatus: (status: number) => boolean;
    };
    expect(requestConfig.validateStatus(404)).toBe(true);
    expect(requestConfig.validateStatus(500)).toBe(false);
    expect(requestConfig.validateStatus(200)).toBe(true);
  });

  it('returns the resolved handoff payload', async () => {
    const service = new AgentStudioHandoffService('token-a');
    const payload = {
      brandId: 'brand-1',
      modelKey: 'provider/model-x',
      prompt: 'A futuristic city at sunset',
      type: 'image',
    };
    const mockGet = vi.fn().mockResolvedValue({ data: payload, status: 200 });
    const serviceWithMockedInstance = service as unknown as {
      instance: { get: typeof mockGet };
    };
    serviceWithMockedInstance.instance.get = mockGet;

    await expect(service.consume('handoff-1')).resolves.toBe(payload);
  });

  it('forwards an abort signal', async () => {
    const service = new AgentStudioHandoffService('token-a');
    const mockGet = vi.fn().mockResolvedValue({ data: null, status: 200 });
    const serviceWithMockedInstance = service as unknown as {
      instance: { get: typeof mockGet };
    };
    serviceWithMockedInstance.instance.get = mockGet;
    const controller = new AbortController();

    await service.consume('handoff-1', controller.signal);

    expect(mockGet).toHaveBeenCalledWith('/agent/studio-handoff/handoff-1', {
      signal: controller.signal,
      validateStatus: expect.any(Function),
    });
  });
});
