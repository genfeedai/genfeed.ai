import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockFlattenCollection = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
}));

describe('api/posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists posts without params', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ createdAt: '2026-08-01', id: 'post-1' }]);

    const { listPosts } = await import('../../src/api/posts');
    const result = await listPosts();

    expect(mockGet).toHaveBeenCalledWith('/posts');
    expect(result).toEqual([{ createdAt: '2026-08-01', id: 'post-1' }]);
  });

  it('lists posts with platform, executionState, and limit filters', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { listPosts } = await import('../../src/api/posts');
    await listPosts({
      executionState: 'published',
      limit: 10,
      platform: 'instagram',
    });

    expect(mockGet).toHaveBeenCalledWith(
      '/posts?platform=instagram&executionState=published&limit=10'
    );
  });
});
