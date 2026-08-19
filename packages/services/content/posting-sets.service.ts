import { API_ENDPOINTS } from '@genfeedai/constants';
import type {
  CreatePostingSetInput,
  UpdatePostingSetInput,
} from '@genfeedai/interfaces';
import { PostingSet } from '@genfeedai/models/content/posting-set.model';
import { PostingSetSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';
import type { JsonApiResponseDocument } from '@services/core/json-api';

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
  ): Promise<{ targets: unknown[] }> {
    const response = await this.instance.post<JsonApiResponseDocument>(
      `/${id}/expand`,
      data,
    );
    return response.data as { targets: unknown[] };
  }
}
