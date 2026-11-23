import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockFlattenCollection = vi.fn();

vi.mock('../../src/api/client', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
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

  it('deletes a post through the deletions route and asks for its media only on request', async () => {
    mockPost.mockImplementation(async (path: string, body: unknown) => ({ body, path }));

    const { deletePost } = await import('../../src/api/posts');

    await expect(deletePost('post-1')).resolves.toEqual({
      body: { includeMedia: false },
      path: '/posts/post-1/deletions',
    });
    await expect(deletePost('post-1', { includeMedia: true })).resolves.toEqual({
      body: { includeMedia: true },
      path: '/posts/post-1/deletions',
    });
  });
});
