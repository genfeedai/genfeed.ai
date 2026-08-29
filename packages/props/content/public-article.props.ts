export interface PublicArticleViewProps {
  /**
   * Present only on the preview route. The public route never forwards one, so
   * it stays statically renderable.
   */
  previewToken?: string;
  slug: string;
}

export interface PublicArticleRouteParams {
  slug: string;
}

/**
 * Next resolves a repeated query key to an array, so a caller appending
 * `?previewToken=a&previewToken=b` yields `string[]` here. The article lookup
 * takes a single token, so the route normalizes before crossing that boundary.
 */
export interface PublicArticlePreviewSearchParams {
  previewToken?: string | string[];
}

export interface PublicArticleRouteProps {
  params: Promise<PublicArticleRouteParams>;
}

export interface PublicArticlePreviewRouteProps
  extends PublicArticleRouteProps {
  searchParams: Promise<PublicArticlePreviewSearchParams>;
}
