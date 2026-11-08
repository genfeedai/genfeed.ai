import type { Article } from '@genfeedai/models/content/article.model';

/**
 * Where "Publish" sends an article. The genfeed.ai website hosts the articles
 * of a public brand, at genfeed.ai/@handle/articles/<slug>, and those of
 * Genfeed's own organization; `publicUrl` is set only for those.
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
