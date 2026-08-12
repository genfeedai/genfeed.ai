import { describe, expect, it, vi } from 'vitest';
import { SocialReadExecutor } from './social-read-executor';

describe('SocialReadExecutor', () => {
  it('requires a provider', async () => {
    const executor = new SocialReadExecutor();
    await expect(
      executor.execute({
        context: { organizationId: 'org', userId: 'user' } as never,
        inputs: new Map(),
        node: { config: {}, id: 'n1', type: 'socialRead' },
      }),
    ).rejects.toThrow(/provider not configured/i);
  });

  it('returns posts and summary for timeline mode', async () => {
    const executor = new SocialReadExecutor();
    const provider = vi.fn().mockResolvedValue([
      {
        authorUsername: 'genfeed',
        id: '1',
        text: 'hello',
        url: 'https://x.com/genfeed/status/1',
      },
    ]);
    executor.setProvider(provider);

    const result = await executor.execute({
      context: {
        brandId: 'brand-1',
        organizationId: 'org',
        userId: 'user',
      } as never,
      inputs: new Map(),
      node: {
        config: { limit: 10, mode: 'timeline', username: 'genfeed' },
        id: 'n1',
        type: 'socialRead',
      },
    });

    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand-1',
        mode: 'timeline',
        username: 'genfeed',
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        count: 1,
        summary: expect.stringContaining('Fetched 1'),
      }),
    );
  });

  it('requires query for search mode', async () => {
    const executor = new SocialReadExecutor();
    executor.setProvider(vi.fn());
    await expect(
      executor.execute({
        context: { organizationId: 'org', userId: 'user' } as never,
        inputs: new Map(),
        node: {
          config: { mode: 'search' },
          id: 'n1',
          type: 'socialRead',
        },
      }),
    ).rejects.toThrow(/query is required/i);
  });
});
