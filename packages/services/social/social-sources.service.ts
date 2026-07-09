import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  CreateSocialSourceInput,
  SocialSourceBrandSyncResult,
  SocialSourceSyncResult,
  SocialSourcesResponse,
  SocialSourceValidationResult,
  UpdateSocialSourceInput,
} from '@genfeedai/interfaces';
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
    brand?: string;
    platform?: string;
    search?: string;
    source?: string;
    postsLimit?: number;
  }): Promise<SocialSourcesResponse> {
    const response = await this.instance.get<SocialSourcesResponse>('/feed', {
      params: options,
    });
    return response.data;
  }

  async syncSource(
    sourceId: string,
    options: { brand?: string; limit?: number } = {},
  ): Promise<SocialSourceSyncResult> {
    const response = await this.instance.post<SocialSourceSyncResult>(
      `/${sourceId}/sync`,
      { limit: options.limit },
      { params: { brand: options.brand } },
    );
    return response.data;
  }

  async syncBrand(
    options: { brand?: string; limit?: number } = {},
  ): Promise<SocialSourceBrandSyncResult> {
    const response = await this.instance.post<SocialSourceBrandSyncResult>(
      '/sync',
      { limit: options.limit },
      { params: { brand: options.brand } },
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
