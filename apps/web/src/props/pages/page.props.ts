export interface OAuthPageProps {
  params: Promise<{ platform: string }>;
}

export interface TagsFilterPageProps {
  params: Promise<{
    filter: 'all' | 'default' | 'organization' | 'account';
  }>;
}

export interface BrandPlatformHomePageProps {
  params: Promise<{
    brandSlug: string;
    orgSlug: string;
    platform: string;
  }>;
}

/**
 * Generic detail page props with id parameter
 * Used for /posts/[id], /brands/[id], /templates/[id], etc.
 */
export interface DetailPageProps {
  params: Promise<{ id: string }>;
}

export interface StoryboardRunPageProps {
  params: Promise<{ runId: string }>;
}
