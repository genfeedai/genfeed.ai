import type { ApifyLinkedInPost } from '@api/services/integrations/apify/interfaces/apify.interfaces';
import { ApifyBaseService } from '@api/services/integrations/apify/services/modules/apify-base.service';
import { ResearchCollectionRunner } from '@api/services/research-access/research-collection-runner.service';
import type { SocialSourceResearchContext } from '@api/services/source-collector/source-collector.types';
import { Injectable } from '@nestjs/common';

/**
 * ApifyLinkedInService
 *
 * Handles LinkedIn-related Apify scraping operations: public profile posts
 * (used to collect a competitor's LinkedIn timeline for Following/social
 * sources, since LinkedIn's own API only serves the authenticated member).
 */
@Injectable()
export class ApifyLinkedInService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly baseService: ApifyBaseService,
    private readonly runner: ResearchCollectionRunner,
  ) {}

  /**
   * Get recent posts from a public LinkedIn profile.
   * Used to monitor competitor accounts. Hard-fails when Apify is not
   * configured so Following sync cannot look "successful" with zero posts
   * after a silent skip.
   */
  async getLinkedInProfilePosts(
    profileUrl: string,
    options?: { limit?: number },
    researchContext?: SocialSourceResearchContext,
  ): Promise<ApifyLinkedInPost[]> {
    const token = researchContext ? undefined : this.baseService.getApiToken();
    if (!researchContext && !token) {
      throw new Error(
        'APIFY_API_TOKEN is not configured — cannot scrape LinkedIn timelines',
      );
    }

    try {
      const input = {
        maxPosts: options?.limit || 20,
        profileUrls: [profileUrl],
      };

      const rawPosts = await (researchContext
        ? this.runner.run<ApifyLinkedInPost>(
            researchContext.organizationId,
            this.baseService.ACTORS.LINKEDIN_PROFILE_SCRAPER,
            input,
            { tokenMode: 'hosted-only', requestScope: 'social-source-hosted' },
          )
        : this.baseService.runActor<ApifyLinkedInPost>(
            this.baseService.ACTORS.LINKEDIN_PROFILE_SCRAPER,
            input,
          ));

      return rawPosts;
    } catch (error: unknown) {
      this.baseService.loggerService.error(
        `${this.constructorName}.getLinkedInProfilePosts failed for ${profileUrl}`,
        error,
      );
      throw error;
    }
  }
}
