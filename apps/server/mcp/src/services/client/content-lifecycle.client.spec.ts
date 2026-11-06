import { ArticleStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BaseApiClient } from './base-api-client';
import { ContentClient } from './content.client';

interface HttpCall {
  body?: unknown;
  method: 'get' | 'patch' | 'post';
  path: string;
}

describe('reviewed article lifecycle', () => {
  let calls: HttpCall[];
  let debugLogs: string[];
  let client: ContentClient;

  beforeEach(() => {
    calls = [];
    debugLogs = [];
    // A tiny in-memory API: drafts are stored on POST, published on PATCH,
    // and the preview endpoint issues a bearer URL.
    const articles = new Map<string, Record<string, unknown>>();
    const http = {
      get: async (path: string) => {
        calls.push({ method: 'get', path });
        return {
          data: {
            expiresInSeconds: 3600,
            url: 'https://genfeed.ai/articles/tested-guide?previewToken=secret',
          },
        };
      },
      patch: async (
        path: string,
        body: { data: { attributes: Record<string, unknown>; id: string } },
      ) => {
        calls.push({ body, method: 'patch', path });
        const id = body.data.id;
        const updated = { ...articles.get(id), ...body.data.attributes };
        articles.set(id, updated);
        return { data: { data: { attributes: updated, id } } };
      },
      post: async (
        path: string,
        body: { data: { attributes: Record<string, unknown> } },
      ) => {
        calls.push({ body, method: 'post', path });
        const id = `article-${articles.size + 1}`;
        articles.set(id, body.data.attributes);
        return { data: { data: { attributes: body.data.attributes, id } } };
      },
    };

    client = new ContentClient({
      failWith: (message: string) => () => {
        throw new Error(message);
      },
      failWithDetail: (message: string) => () => {
        throw new Error(message);
      },
      logger: {
        debug: (message: string, context?: unknown) => {
          debugLogs.push(`${message} ${JSON.stringify(context ?? {})}`);
        },
      },
      request: async (
        _operation: string,
        call: (client: typeof http) => Promise<unknown>,
      ) => call(http),
    } as unknown as BaseApiClient);
  });

  it('imports full reviewed HTML as a draft without the generation endpoint or publication fields', async () => {
    const content = `<p>${'Source-backed content. '.repeat(100)}</p>`;

    const result = await client.createArticleDraft({
      content,
      label: 'Tested guide',
      slug: 'tested-guide',
      summary: 'A verified workflow.',
    });

    expect(result.id).toBe('article-1');
    expect(calls).toEqual([
      {
        body: {
          data: {
            attributes: {
              content,
              label: 'Tested guide',
              slug: 'tested-guide',
              status: ArticleStatus.DRAFT,
              summary: 'A verified workflow.',
            },
            type: 'articles',
          },
        },
        method: 'post',
        path: '/articles',
      },
    ]);
  });

  it('uses the authenticated preview endpoint without logging the bearer URL', async () => {
    const result = await client.getArticlePreview('article-1');

    expect(result.expiresInSeconds).toBe(3600);
    expect(calls).toEqual([
      { method: 'get', path: '/articles/article-1/preview-links' },
    ]);
    expect(debugLogs.join('\n')).not.toContain('previewToken=secret');
  });

  it('publishes separately without rewriting the reviewed content or publication date', async () => {
    await client.createArticleDraft({
      content: '<p>Reviewed</p>',
      label: 'Tested guide',
      slug: 'tested-guide',
      summary: 'A verified workflow.',
    });

    await client.publishArticle('article-1');

    expect(calls.at(-1)).toEqual({
      body: {
        data: {
          attributes: { status: ArticleStatus.PUBLISHED },
          id: 'article-1',
          type: 'articles',
        },
      },
      method: 'patch',
      path: '/articles/article-1',
    });
  });
});
