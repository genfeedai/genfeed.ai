import type { Article } from '@genfeedai/models/content/article.model';

/**
 * Where "Publish" sends an article. Only Genfeed's own organization is hosted
 * on the genfeed.ai website; `publicUrl` is set only for that organization.
 */
export type ArticlePublishDestination = {
  isHostedOnWebsite: boolean;
  publicUrl?: string;
};

export type ArticlePublicPageCardProps = {
  article: Article;
  destination: ArticlePublishDestination;
  isPublished: boolean;
  summary: string;
  title: string;
};
