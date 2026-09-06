import { SocialSourceType } from '@genfeedai/contracts';
import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreateSocialSourceInput,
  SocialPostImportResult,
  SocialSourceBrandSyncResult,
  SocialSourceHistoryImportScheduleResult,
  SocialSourceSyncResult,
  SocialSourcesResponse,
  SocialSourceValidationResult,
  UpdateSocialSourceInput,
} from '@genfeedai/contracts/interfaces';
import { SocialSource } from '@genfeedai/models/social/social-source.model';
import { SocialSourceSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

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

  /**
   * The brand's own connected accounts, auto-created at connect time. Each
   * carries its history-import audit under `metadata.historyImport`.
   */
  async listOwnAccountSources(brandId: string): Promise<SocialSource[]> {
    const response = await this.instance.get<JsonApiResponseDocument>('', {
      params: {
        brandId,
        limit: 50,
        sourceType: SocialSourceType.OWN_ACCOUNT,
      },
    });
    return this.mapMany(response.data);
  }

  async scheduleHistoryImport(
    sourceId: string,
    brandId: string,
  ): Promise<SocialSourceHistoryImportScheduleResult> {
    const response =
      await this.instance.post<SocialSourceHistoryImportScheduleResult>(
        `/${sourceId}/history-import`,
        undefined,
        { params: { brandId } },
      );
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
