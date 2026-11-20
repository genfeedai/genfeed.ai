export interface ArticleDraftInput {
  label: string;
  slug: string;
  summary: string;
  content: string;
  coverImageUrl?: string;
  brandId?: string;
}

/** Fields of an existing article to change; omitted fields stay as they are. */
export interface ArticleUpdateInput {
  articleId: string;
  brandId?: string;
  label?: string;
  slug?: string;
  summary?: string;
  content?: string;
  coverImageUrl?: string;
}

/** Expiring bearer link; do not send it to analytics or application logs. */
export interface ArticlePreviewLink {
  expiresInSeconds: number;
  url: string;
}
