import { buildLinkedInOrganizationUrn } from '@api/services/integrations/linkedin/utils/linkedin-author.util';
import { getSafeLinkedInOAuthErrorLog } from '@api/services/integrations/linkedin/utils/linkedin-oauth-error.util';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Page roles LinkedIn lets post as the page (Posts API, `w_organization_social`).
 * LinkedIn's posts page spells the content role CONTENT_ADMIN while its role
 * table spells it CONTENT_ADMINISTRATOR, so both are accepted.
 */
const LINKEDIN_PAGE_POSTER_ROLES = new Set([
  'ADMINISTRATOR',
  'CONTENT_ADMIN',
  'CONTENT_ADMINISTRATOR',
  'DIRECT_SPONSORED_CONTENT_POSTER',
]);
const LINKEDIN_ORGANIZATION_ACL_PAGE_SIZE = 50;
const LINKEDIN_ORGANIZATION_URN_ID_PATTERN = /^urn:li:organization:(\d+)$/;
const LINKEDIN_ORGANIZATION_ACL_MAX_PAGES = 4;

/** One account a LinkedIn token can post as: the member, or a page they run. */
export interface LinkedInAccountCandidate {
  /** Value stored as the credential's `externalId`. */
  id: string;
  kind: 'member' | 'organization';
  label: string;
  /** Page vanity name, when LinkedIn returned one. */
  username?: string;
  image?: string;
}

type LinkedInOrganizationAclElement = {
  organization?: string;
  role?: string;
  state?: string;
};

type LinkedInOrganizationAclsResponse = {
  elements?: LinkedInOrganizationAclElement[];
  paging?: { count?: number; start?: number; total?: number };
};

type LinkedInOrganizationNode = {
  localizedName?: string;
  vanityName?: string;
};

/**
 * Discovers the accounts a LinkedIn token can post as. Plain class built by
 * `LinkedInService`, like `LinkedInAnalyticsService`, so it shares that
 * service's HTTP client and logger.
 */
export class LinkedInAccountsLookup {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly getApiUrl: (path: string) => string,
    private readonly getUserProfile: (accessToken: string) => Promise<{
      email: string;
      firstName: string;
      id: string;
      lastName: string;
      picture?: string;
    }>,
  ) {}

  /**
   * Every account this token can post as: the member's own profile, then each
   * company page they hold a posting role on. The caller picks one; nothing
   * here chooses for them.
   *
   * The member is always listed, so a token that administers no pages still
   * connects; a failure reading the page list fails the whole call instead of
   * quietly offering the profile alone, since that would put a personal profile
   * on a brand whose owner meant a page.
   */
  public async list(accessToken: string): Promise<LinkedInAccountCandidate[]> {
    const url = `${LinkedInAccountsLookup.name} ${CallerUtil.getCallerName()}`;

    try {
      const profile = await this.getUserProfile(accessToken);
      const memberLabel = `${profile.firstName} ${profile.lastName}`.trim();
      const organizationIds =
        await this.listPostableOrganizationIds(accessToken);
      const pages = await Promise.all(
        organizationIds.map((organizationId) =>
          this.readOrganizationCandidate(accessToken, organizationId),
        ),
      );

      this.loggerService.log(`${url} succeeded`, { pages: pages.length });

      return [
        ...pages,
        {
          id: profile.id,
          ...(profile.picture ? { image: profile.picture } : {}),
          kind: 'member',
          label: memberLabel || profile.email,
        },
      ];
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      throw error;
    }
  }

  private async listPostableOrganizationIds(
    accessToken: string,
  ): Promise<string[]> {
    const organizationIds: string[] = [];

    for (let page = 0; page < LINKEDIN_ORGANIZATION_ACL_MAX_PAGES; page += 1) {
      const response = await firstValueFrom(
        this.httpService.get<LinkedInOrganizationAclsResponse>(
          this.getApiUrl('organizationAcls'),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
            params: {
              count: LINKEDIN_ORGANIZATION_ACL_PAGE_SIZE,
              q: 'roleAssignee',
              start: page * LINKEDIN_ORGANIZATION_ACL_PAGE_SIZE,
              state: 'APPROVED',
            },
            timeout: 30000,
          },
        ),
      );
      const elements = response.data?.elements ?? [];

      for (const element of elements) {
        const organizationId = element.organization?.match(
          LINKEDIN_ORGANIZATION_URN_ID_PATTERN,
        )?.[1];
        if (
          organizationId &&
          element.role &&
          LINKEDIN_PAGE_POSTER_ROLES.has(element.role) &&
          !organizationIds.includes(organizationId)
        ) {
          organizationIds.push(organizationId);
        }
      }

      if (elements.length < LINKEDIN_ORGANIZATION_ACL_PAGE_SIZE) {
        break;
      }
    }

    return organizationIds;
  }

  /** Name and vanity handle of one page; a failed read keeps the page listed. */
  private async readOrganizationCandidate(
    accessToken: string,
    organizationId: string,
  ): Promise<LinkedInAccountCandidate> {
    const id = buildLinkedInOrganizationUrn(organizationId);

    try {
      const response = await firstValueFrom(
        this.httpService.get<LinkedInOrganizationNode>(
          this.getApiUrl(`organizations/${organizationId}`),
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
            timeout: 30000,
          },
        ),
      );

      return {
        id,
        kind: 'organization',
        label:
          response.data?.localizedName || `LinkedIn page ${organizationId}`,
        ...(response.data?.vanityName
          ? { username: response.data.vanityName }
          : {}),
      };
    } catch (error: unknown) {
      this.loggerService.warn(
        `${LinkedInAccountsLookup.name} page details unavailable`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      return {
        id,
        kind: 'organization',
        label: `LinkedIn page ${organizationId}`,
      };
    }
  }
}
