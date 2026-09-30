import {
  clearAllServiceInstances,
  HTTPBaseService,
} from '@services/core/interceptor.service';
import { BrandInterviewService } from '@services/social/brand-interview.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

describe('BrandInterviewService', () => {
  beforeEach(() => {
    HTTPBaseService.clearAllInstances();
    vi.clearAllMocks();
  });

  it('returns the same cached instance for a repeated token', () => {
    const first = BrandInterviewService.getInstance('token-a');
    const second = BrandInterviewService.getInstance('token-a');

    expect(first).toBeInstanceOf(BrandInterviewService);
    expect(second).toBe(first);
  });

  it('returns a distinct instance per token', () => {
    const a = BrandInterviewService.getInstance('token-a');
    const b = BrandInterviewService.getInstance('token-b');

    expect(a).not.toBe(b);
  });

  it('participates in the shared cache cleared on sign-out', () => {
    // clearAllServiceInstances() runs on logout and must wipe this service's
    // token-bound instance so stale tokens cannot leak across sessions.
    const before = BrandInterviewService.getInstance('token-a');

    clearAllServiceInstances();

    const after = BrandInterviewService.getInstance('token-a');
    expect(after).not.toBe(before);
  });

  it('treats a missing active interview as an expected empty result', async () => {
    const service = new BrandInterviewService('token-a');
    const mockGet = vi.fn().mockResolvedValue({ data: null, status: 404 });
    const serviceWithMockedInstance = service as unknown as {
      instance: { get: typeof mockGet };
    };
    serviceWithMockedInstance.instance.get = mockGet;

    const result = await service.getActiveInterview('brand-1');

    expect(result).toBeNull();
    expect(mockGet).toHaveBeenCalledWith('/brand-1/interview/active', {
      signal: undefined,
      validateStatus: expect.any(Function),
    });

    const requestConfig = mockGet.mock.calls[0]?.[1] as {
      validateStatus: (status: number) => boolean;
    };
    expect(requestConfig.validateStatus(404)).toBe(true);
    expect(requestConfig.validateStatus(500)).toBe(false);
  });

  it('returns the active interview payload', async () => {
    const service = new BrandInterviewService('token-a');
    const activeInterview = { id: 'interview-1' };
    const mockGet = vi
      .fn()
      .mockResolvedValue({ data: activeInterview, status: 200 });
    const serviceWithMockedInstance = service as unknown as {
      instance: { get: typeof mockGet };
    };
    serviceWithMockedInstance.instance.get = mockGet;

    await expect(service.getActiveInterview('brand-1')).resolves.toBe(
      activeInterview,
    );
  });
});
