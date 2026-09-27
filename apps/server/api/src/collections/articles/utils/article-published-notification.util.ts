import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { readNonEmptyString } from '@api/collections/articles/utils/article-input-boundary.util';
import type { ChannelDispatchInput } from '@api/services/activity-recording/activity-recording.types';

/**
 * The operator Discord card for a just-published article, as an outbox
 * channel delivery (#5197). One card per article, however often it is saved.
 */
export function buildArticlePublishedDispatch(
  article: ArticleDocument,
  organizationId: string,
  publicBaseUrl: string | undefined,
): ChannelDispatchInput {
  // PUBLISHED articles are public, so a slug always has a public URL.
  const publicUrl = article.slug
    ? `${publicBaseUrl}/articles/${article.slug}`
    : undefined;
  return {
    deduplicationKey: `message.article-published/${article.id}`,
    messages: [
      {
        destination: null,
        message: {
          action: 'article_notification',
          payload: {
            category: readNonEmptyString(article.category),
            // `articles.label` is NOT NULL, so the row always carries it.
            label: String(article.label),
            publicUrl,
            slug: readNonEmptyString(article.slug) ?? article.id,
            summary: readNonEmptyString(article.summary),
          },
          type: 'discord',
        },
      },
    ],
    organizationId,
    source: { id: article.id, type: 'article' },
    topic: 'operator.alerts',
  };
}
