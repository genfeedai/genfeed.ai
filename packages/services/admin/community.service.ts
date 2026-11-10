import type {
  IAdminCommunityOverview,
  IAdminCommunityOverviewResponse,
} from '@genfeedai/contracts/interfaces';
import { EnvironmentService } from '@services/core/environment.service';
import { HTTPBaseService } from '@services/core/interceptor.service';

/** What an operator curates on genfeed.ai/community. */
export type AdminCommunityTarget = 'creators' | 'media';

/**
 * Operator curation of genfeed.ai/community (#9670), one organization at a
 * time: feature its public creators and media, or take them off community.
 */
export class AdminCommunityService extends HTTPBaseService {
  constructor(token: string) {
    super(`${EnvironmentService.apiEndpoint}/admin/organizations`, token);
  }

  public static getInstance(token: string): AdminCommunityService {
    return HTTPBaseService.getBaseServiceInstance(
      AdminCommunityService,
      token,
    ) as AdminCommunityService;
  }

  async getOverview(
    organizationId: string,
    page: number,
    signal?: AbortSignal,
  ): Promise<IAdminCommunityOverview> {
    const response = await this.instance.get<IAdminCommunityOverviewResponse>(
      `${encodeURIComponent(organizationId)}/community`,
      { params: { page }, signal },
    );
    return response.data.data;
  }

  async setFeatured(
    organizationId: string,
    target: AdminCommunityTarget,
    id: string,
    isFeatured: boolean,
  ): Promise<void> {
    const path = `${this.itemPath(organizationId, target, id)}/featured`;
    if (isFeatured) {
      await this.instance.put(path);
    } else {
      await this.instance.delete(path);
    }
  }

  /** Off community; the organization keeps it. */
  async unpublish(
    organizationId: string,
    target: AdminCommunityTarget,
    id: string,
  ): Promise<void> {
    await this.instance.delete(this.itemPath(organizationId, target, id));
  }

  private itemPath(
    organizationId: string,
    target: AdminCommunityTarget,
    id: string,
  ): string {
    return `${encodeURIComponent(organizationId)}/community/${target}/${encodeURIComponent(id)}`;
  }
}
