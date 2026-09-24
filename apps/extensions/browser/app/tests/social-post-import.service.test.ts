import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('~services/auth.service', () => ({
  authService: { getToken: mocks.getToken },
}));

import {
  importSocialPost,
  listImportedSourcePosts,
  resolveImportedRemixUrl,
} from '../src/services/social-post-import.service';

const root = path.dirname(fileURLToPath(import.meta.url));

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    json: async () => body,
    ok,
    status,
  };
}

describe('social post import service', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.getToken.mockReset().mockResolvedValue('token');
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('posts the existing import contract for the selected brand only', async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({
        deduplicated: false,
        post: {
          authorDisplayName: 'Author',
          authorHandle: 'author',
          collectedAt: null,
          id: 'post-1',
          platform: 'twitter',
          sourceUrl: 'https://x.com/author/status/1',
          text: 'Original',
        },
      }),
    );

    const result = await importSocialPost({
      brandId: 'brand-a',
      url: 'https://x.com/author/status/1',
    });

    expect(result.deduplicated).toBe(false);
    expect(result.post).toMatchObject({
      authorHandle: 'author',
      id: 'post-1',
      text: 'Original',
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.genfeed.ai/v1/social-sources/import-post?brandId=brand-a',
      expect.objectContaining({
        body: JSON.stringify({ url: 'https://x.com/author/status/1' }),
        method: 'POST',
      }),
    );
  });

  it('reuses the same brand record when the API says the post already exists', async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse({
        deduplicated: true,
        post: {
          authorHandle: 'author',
          id: 'post-1',
          platform: 'twitter',
          sourceUrl: 'https://x.com/author/status/1',
          text: 'Original',
        },
      }),
    );

    const result = await importSocialPost({
      brandId: 'brand-a',
      url: 'https://x.com/author/status/1',
    });

    expect(result.deduplicated).toBe(true);
    expect(result.post.id).toBe('post-1');
  });

  it('scopes a second brand to a different import request', async () => {
    mocks.fetch.mockResolvedValue(
      jsonResponse({
        deduplicated: false,
        post: { id: 'post-2', platform: 'twitter', text: 'Other' },
      }),
    );

    await importSocialPost({
      brandId: 'brand-b',
      url: 'https://x.com/author/status/2',
    });

    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain('brandId=brand-b');
    expect(String(mocks.fetch.mock.calls[0]?.[0])).not.toContain('brand-a');
  });

  it('returns the API error and does not pretend the import succeeded', async () => {
    mocks.fetch.mockResolvedValueOnce(
      jsonResponse(
        {
          message:
            'Post could not be resolved — it may be deleted, private, or the link is wrong',
        },
        false,
        404,
      ),
    );

    await expect(
      importSocialPost({
        brandId: 'brand-a',
        url: 'https://x.com/author/status/404',
      }),
    ).rejects.toThrow(/deleted, private/);
  });

  it('rejects an unsupported URL before calling the API', async () => {
    await expect(
      importSocialPost({
        brandId: 'brand-a',
        url: 'https://example.com/article',
      }),
    ).rejects.toThrow(/X, Instagram, or TikTok/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('loads imported posts from the filtered source-posts pages, not the brand feed', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              attributes: {
                authorHandle: 'saved',
                platform: 'instagram',
                sourceUrl: 'https://instagram.com/p/abc',
                text: 'Saved post',
              },
              id: 'imported-post',
              type: 'source-post',
            },
          ],
          links: { pagination: { page: 1, pages: 2 } },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              attributes: { authorHandle: 'older', text: 'Older import' },
              id: 'older-import',
              type: 'source-post',
            },
          ],
          links: { pagination: { page: 2, pages: 2 } },
        }),
      );

    const posts = await listImportedSourcePosts('brand-a');

    expect(posts.map((post) => post.id)).toEqual([
      'imported-post',
      'older-import',
    ]);
    const urls = mocks.fetch.mock.calls.map((call) => String(call[0]));
    expect(urls[0]).toContain('/source-posts?');
    expect(urls[0]).toContain('sourceType=post');
    expect(urls[0]).toContain('brandId=brand-a');
    expect(urls[0]).not.toContain('social-sources/feed');
    expect(urls[1]).toContain('page=2');
    expect(urls.every((url) => !url.includes('social-sources/feed'))).toBe(
      true,
    );
  });

  it('opens remix for the selected brand and source without collecting or generating', async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            attributes: { slug: 'moonrise' },
            id: 'brand-a',
            type: 'brand',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 'org-1', isActive: true, label: 'Acme', slug: 'acme' },
        ]),
      );

    const url = await resolveImportedRemixUrl({
      brandId: 'brand-a',
      platform: 'twitter',
      sourcePostId: 'post-1',
    });

    expect(url).toBe(
      'https://app.genfeed.ai/acme/moonrise/publishing/remix?platform=twitter&sourcePostId=post-1',
    );
    const urls = mocks.fetch.mock.calls.map((call) => String(call[0]));
    expect(urls.some((item) => item.includes('/videos'))).toBe(false);
    expect(urls.some((item) => item.includes('knowledge-sources'))).toBe(false);
    expect(
      urls.some((item) => item.includes('/social-sources/import-post')),
    ).toBe(false);
  });

  it('does not mention Knowledge or generation endpoints', () => {
    const source = readFileSync(
      path.resolve(root, '../src/services/social-post-import.service.ts'),
      'utf8',
    );
    expect(source).not.toContain('knowledge-sources');
    expect(source).not.toContain('/videos');
    expect(source).not.toContain("'/posts");
    expect(source).not.toContain('AgentTools');
  });
});
