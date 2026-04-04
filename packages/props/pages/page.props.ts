/**
 * Props for Next.js page components with dynamic route parameters
 */

export interface IngredientsListPageProps {
  params: Promise<{ type: string }>;
}

export interface OAuthPageProps {
  params: Promise<{ platform: string }>;
}

export interface TagsFilterPageProps {
  params: Promise<{
    filter: 'all' | 'default' | 'organization' | 'account';
  }>;
}

export interface PostsPlatformPageProps {
  params: Promise<{ platform: string }>;
}

export interface AnalyticsBrandPageProps {
  params: Promise<{ id: string }>;
}

export interface AnalyticsBrandPlatformPageProps {
  params: Promise<{ id: string; platform: string }>;
}

export interface PostsListPageProps {
  searchParams: Promise<{ platform?: string; status?: string }>;
}

export interface ArticlesStatusPageProps {
  params: Promise<{ status: string }>;
}

/**
 * Generic detail page props with id parameter
 * Used for /posts/[id], /brands/[id], /templates/[id], etc.
 */
export interface DetailPageProps {
  params: Promise<{ id: string }>;
}

export interface ElementConfig {
  visibleFilters: {
    search?: boolean;
    status?: boolean;
    format?: boolean;
    type?: boolean;
    provider?: boolean;
    model?: boolean;
    sort?: boolean;
  };
  filterOptions?: {
    sort?: Array<{ value: string; label: string }>;
  };
}
