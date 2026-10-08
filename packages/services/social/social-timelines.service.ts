import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  SocialTimelineResponse,
  SourcePostNativeActionInput,
  SourcePostNativeActionResult,
} from '@genfeedai/contracts/interfaces';
import { SourcePost } from '@genfeedai/models/social/source-post.model';
import { SourcePostSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class SocialTimelinesService extends BaseService<SourcePost> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.SOCIAL_TIMELINES,
      token,
      SourcePost,
      SourcePostSerializer,
    );
  }
  static getInstance(token: string): SocialTimelinesService {
    return BaseService.getDataServiceInstance(SocialTimelinesService, token);
  }
  async read(brandId: string): Promise<SocialTimelineResponse> {
    const response = await this.instance.get<SocialTimelineResponse>('', {
      params: { brandId },
    });
    return response.data;
  }
  async refresh(
    brandId: string,
    credentialId?: string,
  ): Promise<SocialTimelineResponse> {
    const response = await this.instance.post<SocialTimelineResponse>(
      '/refresh',
      { credentialId },
      { params: { brandId }, timeout: 120000 },
    );
    return response.data;
  }
  async act(
    brandId: string,
    postId: string,
    input: SourcePostNativeActionInput,
  ): Promise<SourcePostNativeActionResult> {
    const response = await this.instance.post<SourcePostNativeActionResult>(
      `/posts/${postId}/actions`,
      input,
      { params: { brandId } },
    );
    return response.data;
  }
}
