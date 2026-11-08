import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import {
  PUBLIC_ARTICLE_BRAND_INCLUDE,
  PUBLIC_BRAND_WHERE,
} from '@api/helpers/utils/public-brand/public-brand-filter.util';
import {
  GENFEED_BRAND_HANDLE,
  PUBLIC_ARTICLES_ORGANIZATION_SLUG,
} from '@genfeedai/contracts/constants';

const PUBLIC_ARTICLE_HOST_SELECT = {
  organizationId: true,
  ...PUBLIC_ARTICLE_BRAND_INCLUDE,
};

interface PublicArticleHostQuery {
  select: typeof PUBLIC_ARTICLE_HOST_SELECT;
  where: { id: string; isDeleted: boolean };
}

interface PublicArticleHost {
  brand?: { isDeleted?: unknown; scope?: unknown; slug?: string | null } | null;
  organizationId?: unknown;
}

/**
 * genfeed.ai hosts an article when its brand is public (it then lives at
 * `/@<handle>/articles/<slug>`) or when Genfeed's own organization wrote it.
 * Genfeed's organization is pinned by id: a configured `PUBLIC_ARTICLES_ORGANIZATION_ID` is used as is, so renaming
 * the organization never unpublishes the site. Without it the id is resolved
 * once by the unique slug. While it cannot be resolved nothing is cached and
 * every anonymous read matches no tenant.
 */
export class PublicArticleScope {
  private organizationId?: string;

  constructor(
    private readonly getOrganizationsService: () =>
      | OrganizationsService
      | undefined,
    private readonly getConfiguredOrganizationId: () =>
      | string
      | undefined = () => undefined,
    private readonly findArticleHost: (
      query: PublicArticleHostQuery,
    ) => Promise<object | null> = async () => null,
  ) {}

  async resolveOrganizationId(): Promise<string | null> {
    const configuredOrganizationId = this.getConfiguredOrganizationId()?.trim();
    if (configuredOrganizationId) {
      return configuredOrganizationId;
    }

    if (this.organizationId) {
      return this.organizationId;
    }

    const organization = await this.getOrganizationsService()?.findOne({
      isDeleted: false,
      slug: PUBLIC_ARTICLES_ORGANIZATION_SLUG,
    });
    const organizationId = organization?.id ? String(organization.id) : null;
    if (organizationId) {
      this.organizationId = organizationId;
    }
    return organizationId;
  }

  async isHostedOrganization(organizationId: string): Promise<boolean> {
    return (await this.resolveOrganizationId()) === organizationId;
  }

  private async buildOrganizationFilter(): Promise<string | { in: string[] }> {
    return (await this.resolveOrganizationId()) ?? { in: [] };
  }

  /** A public brand, or Genfeed's own organization, may host the article. */
  private async buildHostFilter(): Promise<Record<string, unknown>> {
    return {
      OR: [
        { organizationId: await this.buildOrganizationFilter() },
        { brand: { is: PUBLIC_BRAND_WHERE } },
      ],
    };
  }

  /**
   * `/@<handle>/articles/:slug`. A verified preview names an exact record
   * (draft slugs can overlap across tenants) and skips the release filter,
   * never the host filter.
   */
  async buildSlugWhere(
    slug: string,
    previewArticleId: string | null,
  ): Promise<Record<string, unknown>> {
    if (previewArticleId) {
      return {
        AND: [await this.buildHostFilter()],
        id: previewArticleId,
        isDeleted: false,
        slug,
      };
    }
    return { isDeleted: false, slug, ...(await this.buildWhere()) };
  }

  /**
   * Every anonymous article read (website, RSS, brand profiles, preview
   * links) goes through this filter. The host clause sits under `AND` so a
   * caller's own `OR` (search) never replaces it.
   */
  async buildWhere(now: Date = new Date()): Promise<Record<string, unknown>> {
    return {
      ...ArticleFilterUtil.buildPublicArticleVisibilityFilter(now),
      AND: [await this.buildHostFilter()],
    };
  }

  /**
   * The genfeed.ai handle an article is public under: its brand's handle when
   * the brand is public, `genfeedai` for Genfeed's own brandless or
   * private-brand articles, otherwise `null` (the article has no public page).
   */
  readonly resolveHandle = async (
    articleId: string,
  ): Promise<string | null> => {
    const article = (await this.findArticleHost({
      select: PUBLIC_ARTICLE_HOST_SELECT,
      where: { id: articleId, isDeleted: false },
    })) as PublicArticleHost | null;
    if (!article) {
      return null;
    }
    const { brand } = article;
    if (
      brand?.slug &&
      brand.isDeleted === false &&
      brand.scope === PUBLIC_BRAND_WHERE.scope
    ) {
      return brand.slug;
    }
    return typeof article.organizationId === 'string' &&
      (await this.isHostedOrganization(article.organizationId))
      ? GENFEED_BRAND_HANDLE
      : null;
  };
}
