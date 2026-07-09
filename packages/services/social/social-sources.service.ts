import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  CreateSocialSourceInput,
  SocialSourceSyncResult,
  SocialSourcesResponse,
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

  async syncBrand(options: { brand?: string; limit?: number } = {}) {
    const response = await this.instance.post(
      '/sync',
      { limit: options.limit },
      { params: { brand: options.brand } },
    );
    return response.data;
  }

  async validateSource(platform: string, handle: string) {
    const response = await this.instance.post('/validate', {
      handle,
      platform,
    });
    return response.data;
  }
}
