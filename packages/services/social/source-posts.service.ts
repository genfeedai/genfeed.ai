import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  SourcePostDraftActionInput,
  SourcePostDraftActionResult,
} from '@genfeedai/contracts/interfaces';
import { SourcePost } from '@genfeedai/models/social/source-post.model';
import { SourcePostSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class SourcePostsService extends BaseService<SourcePost> {
  constructor(token: string) {
    super(API_ENDPOINTS.SOURCE_POSTS, token, SourcePost, SourcePostSerializer);
  }

  public static getInstance(token: string): SourcePostsService {
    return BaseService.getDataServiceInstance(SourcePostsService, token);
  }

  async createDraft(
    postId: string,
    body: SourcePostDraftActionInput,
    options: { brandId?: string } = {},
  ): Promise<SourcePostDraftActionResult> {
    const response = await this.instance.post<SourcePostDraftActionResult>(
      `/${postId}/actions/draft`,
      body,
      { params: { brandId: options.brandId } },
    );
    return response.data;
  }
}
