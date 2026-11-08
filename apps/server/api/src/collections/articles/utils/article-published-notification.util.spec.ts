import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { buildArticlePublishedDispatch } from '@api/collections/articles/utils/article-published-notification.util';
import { describe, expect, it } from 'vitest';

function readPublicUrl(
  publicBaseUrl: string | undefined,
  handle: string | null,
): unknown {
  const dispatch = buildArticlePublishedDispatch(
    { id: 'article_1', label: 'Launch', slug: 'launch' } as ArticleDocument,
    'org_1',
    publicBaseUrl,
    handle,
  );
  const payload = dispatch.messages[0]?.message.payload as {
    publicUrl?: string;
  };
  return payload.publicUrl;
}

describe('buildArticlePublishedDispatch', () => {
  it('links the article under its creator handle on genfeed.ai', () => {
    expect(readPublicUrl('https://genfeed.ai/', 'genfeedai')).toBe(
      'https://genfeed.ai/@genfeedai/articles/launch',
    );
  });

  it.each([
    ['no public handle', 'https://genfeed.ai', null],
    ['no public URL', undefined, 'genfeedai'],
  ])('omits the link when there is %s', (_case, baseUrl, handle) => {
    expect(readPublicUrl(baseUrl, handle)).toBeUndefined();
  });
});
