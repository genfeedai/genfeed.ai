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
        organizationId: 'org',
        userId: 'user',
      } as never,
      inputs: new Map([['brand', { id: 'brand-1' }]]),
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

  it('fails closed when the provider throws instead of emitting empty posts', async () => {
    const executor = new SocialReadExecutor();
    executor.setProvider(
      vi.fn().mockRejectedValue(new Error('twitter timeline 503')),
    );

    await expect(
      executor.execute({
        context: { organizationId: 'org', userId: 'user' } as never,
        inputs: new Map(),
        node: {
          config: { mode: 'timeline', username: 'genfeed' },
          id: 'n1',
          type: 'socialRead',
        },
      }),
    ).rejects.toThrow(/twitter timeline 503/);
  });

  it('returns structured author/text/time/metrics for mentions mode', async () => {
    const executor = new SocialReadExecutor();
    const provider = vi.fn().mockResolvedValue([
      {
        authorUsername: 'alice',
        createdAt: '2026-08-12T07:00:00.000Z',
        engagement: 12,
        id: '99',
        likes: 8,
        replies: 2,
        retweets: 2,
        text: 'hey @genfeed',
        url: 'https://x.com/alice/status/99',
      },
    ]);
    executor.setProvider(provider);

    const result = await executor.execute({
      context: { organizationId: 'org', userId: 'user' } as never,
      inputs: new Map(),
      node: {
        config: { mode: 'mentions', username: 'genfeed' },
        id: 'n1',
        type: 'socialRead',
      },
    });

    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'mentions', username: 'genfeed' }),
    );
    const data = result.data as {
      count: number;
      posts: string;
      summary: string;
    };
    expect(data.count).toBe(1);
    expect(JSON.parse(data.posts)).toEqual([
      expect.objectContaining({
        authorUsername: 'alice',
        createdAt: '2026-08-12T07:00:00.000Z',
        likes: 8,
        text: 'hey @genfeed',
      }),
    ]);
    expect(data.summary).toContain('@alice');
  });

  it('treats an empty successful fetch as zero results, not a provider failure', async () => {
    const executor = new SocialReadExecutor();
    executor.setProvider(vi.fn().mockResolvedValue([]));

    const result = await executor.execute({
      context: { organizationId: 'org', userId: 'user' } as never,
      inputs: new Map(),
      node: {
        config: { mode: 'timeline', username: 'genfeed' },
        id: 'n1',
        type: 'socialRead',
      },
    });

    expect(result.data).toEqual(
      expect.objectContaining({
        count: 0,
        summary: 'No timeline results returned.',
      }),
    );
  });
});
