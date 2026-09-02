import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreatePostingSetInput,
  UpdatePostingSetInput,
} from '@genfeedai/contracts/interfaces';
import { PostingSet } from '@genfeedai/models/content/posting-set.model';
import { PostingSetSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class PostingSetsService extends BaseService<
  PostingSet,
  CreatePostingSetInput,
  UpdatePostingSetInput
> {
  constructor(token: string) {
    super(API_ENDPOINTS.POSTING_SETS, token, PostingSet, PostingSetSerializer);
  }

  public static getInstance(token: string): PostingSetsService {
    return BaseService.getDataServiceInstance(PostingSetsService, token);
  }

  async expand(
    id: string,
    data: {
      overrides?: Record<string, unknown>[];
      scheduledDate?: string;
      timezone?: string;
    } = {},
  ): Promise<{ targets: Array<Record<string, unknown>> }> {
    const response = await this.instance.post<{
      targets: Array<Record<string, unknown>>;
    }>(`/${id}/expand`, data);
    return {
      targets: Array.isArray(response.data?.targets)
        ? response.data.targets
        : [],
    };
  }
}
