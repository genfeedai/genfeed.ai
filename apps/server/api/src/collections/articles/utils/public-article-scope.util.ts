import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { PUBLIC_ARTICLES_ORGANIZATION_SLUG } from '@genfeedai/contracts/constants';

/**
 * genfeed.ai hosts only Genfeed's own articles, filtered on `organizationId`.
 * A configured `PUBLIC_ARTICLES_ORGANIZATION_ID` is used as is, so renaming
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

  /**
   * `/articles/:slug`. A verified preview names an exact record (slugs can
   * overlap across tenants) and skips the release filter, never the
   * organization filter.
   */
  async buildSlugWhere(
    slug: string,
    previewArticleId: string | null,
  ): Promise<Record<string, unknown>> {
    if (previewArticleId) {
      return {
        id: previewArticleId,
        isDeleted: false,
        organizationId: await this.buildOrganizationFilter(),
        slug,
      };
    }
    return { isDeleted: false, slug, ...(await this.buildWhere()) };
  }

  /**
   * Every anonymous article read (website, RSS, brand profiles, preview
   * links) goes through this filter.
   */
  async buildWhere(now: Date = new Date()): Promise<Record<string, unknown>> {
    return {
      ...ArticleFilterUtil.buildPublicArticleVisibilityFilter(now),
      organizationId: await this.buildOrganizationFilter(),
    };
  }
}
