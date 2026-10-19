import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.test/v1' },
}));

vi.mock('@services/core/interceptor.service', () => {
  class MockHTTPBaseService {
    instance = { post: mockPost };
    static getBaseServiceInstance(
      Service: new (token: string) => unknown,
      token: string,
    ) {
      return new Service(token);
    }
  }
  return { HTTPBaseService: MockHTTPBaseService };
});

import { StudioProposalsService } from '@services/content/studio-proposals.service';

describe('StudioProposalsService.propose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the brand-scoped endpoint for one surface and returns the result', async () => {
    const result = { isBrandApproved: true, proposals: [], surface: 'video' };
    mockPost.mockResolvedValue({ data: result });
    const controller = new AbortController();

    await expect(
      StudioProposalsService.getInstance('token').propose('brand-1', 'video', {
        count: 4,
        signal: controller.signal,
      }),
    ).resolves.toEqual(result);

    expect(mockPost).toHaveBeenCalledWith(
      '/brands/brand-1/content/studio-proposals',
      { count: 4, surface: 'video' },
      { signal: controller.signal },
    );
  });
});
