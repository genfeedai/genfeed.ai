import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  SourcePostDraftActionInput,
  SourcePostDraftActionResult,
} from '@genfeedai/interfaces';
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
    options: { brand?: string } = {},
  ): Promise<SourcePostDraftActionResult> {
    const response = await this.instance.post<SourcePostDraftActionResult>(
      `/${postId}/actions/draft`,
      body,
      { params: { brand: options.brand } },
    );
    return response.data;
  }

  async publishTwitterAction(
    postId: string,
    body: { actionType: 'reply' | 'quote'; text: string },
    options: { brand?: string } = {},
  ) {
    const response = await this.instance.post(
      `/${postId}/actions/twitter`,
      body,
      { params: { brand: options.brand } },
    );
    return response.data;
  }
}
