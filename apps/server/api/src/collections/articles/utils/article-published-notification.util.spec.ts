import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { buildArticlePublishedDispatch } from '@api/collections/articles/utils/article-published-notification.util';
import { describe, expect, it } from 'vitest';

function readPublicUrl(publicBaseUrl: string | undefined): unknown {
  const dispatch = buildArticlePublishedDispatch(
    { id: 'article_1', label: 'Launch', slug: 'launch' } as ArticleDocument,
    'org_1',
    publicBaseUrl,
  );
  const payload = dispatch.messages[0]?.message.payload as {
    publicUrl?: string;
  };
  return payload.publicUrl;
}

describe('buildArticlePublishedDispatch', () => {
  it('links the genfeed.ai page when the article is hosted there', () => {
    expect(readPublicUrl('https://genfeed.ai/')).toBe(
      'https://genfeed.ai/articles/launch',
    );
  });

  it('omits the link for articles genfeed.ai does not host', () => {
    expect(readPublicUrl(undefined)).toBeUndefined();
  });
});
