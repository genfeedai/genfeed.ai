import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreateSocialSourceInput,
  SocialPostImportResult,
  SocialSourceBrandSyncResult,
  SocialSourceSyncResult,
  SocialSourcesResponse,
  SocialSourceValidationResult,
  UpdateSocialSourceInput,
} from '@genfeedai/contracts/interfaces';
import { SocialSource } from '@genfeedai/models/social/social-source.model';
import { SocialSourceSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class SocialSourcesService extends BaseService<
  SocialSource,
  CreateSocialSourceInput,
  UpdateSocialSourceInput
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.SOCIAL_SOURCES,
      token,
      SocialSource,
      SocialSourceSerializer,
    );
  }

  public static getInstance(token: string): SocialSourcesService {
    return BaseService.getDataServiceInstance(SocialSourcesService, token);
  }

  async getFollowingFeed(options: {
    brandId?: string;
    platform?: string;
    search?: string;
    sourceId?: string;
    postsLimit?: number;
  }): Promise<SocialSourcesResponse> {
    const response = await this.instance.get<SocialSourcesResponse>('/feed', {
      params: options,
    });
    return response.data;
  }

  async syncSource(
    sourceId: string,
    options: { brandId?: string; limit?: number } = {},
  ): Promise<SocialSourceSyncResult> {
    const response = await this.instance.post<SocialSourceSyncResult>(
      `/${sourceId}/sync`,
      { limit: options.limit },
      { params: { brandId: options.brandId } },
    );
    return response.data;
  }

  async syncBrand(
    options: { brandId?: string; limit?: number } = {},
  ): Promise<SocialSourceBrandSyncResult> {
    const response = await this.instance.post<SocialSourceBrandSyncResult>(
      '/sync',
      { limit: options.limit },
      { params: { brandId: options.brandId } },
    );
    return response.data;
  }

  async importPost(
    url: string,
    options: { brandId?: string } = {},
  ): Promise<SocialPostImportResult> {
    const response = await this.instance.post<SocialPostImportResult>(
      '/import-post',
      { url },
      { params: { brandId: options.brandId } },
    );
    return response.data;
  }

  async validateSource(
    platform: string,
    handle: string,
  ): Promise<SocialSourceValidationResult> {
    const response = await this.instance.post<SocialSourceValidationResult>(
      '/validate',
      { handle, platform },
    );
    return response.data;
  }
}
