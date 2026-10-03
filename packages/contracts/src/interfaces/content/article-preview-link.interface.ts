/** `GET /articles/:id/preview-links`: a signed, expiring genfeed.ai preview URL. */
export interface ArticlePreviewLink {
  expiresInSeconds: number;
  url: string;
}
