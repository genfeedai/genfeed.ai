export interface PublicArticleViewProps {
  /**
   * Present only on the preview route. The public route never forwards one, so
   * it stays statically renderable.
   */
  previewToken?: string;
  slug: string;
}

export interface PublicArticleRouteProps {
  params: Promise<{ slug: string }>;
}

export interface PublicArticlePreviewRouteProps
  extends PublicArticleRouteProps {
  searchParams: Promise<{ previewToken?: string }>;
}
