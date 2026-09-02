import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import type {
  CreatePostingSignatureInput,
  UpdatePostingSignatureInput,
} from '@genfeedai/contracts/interfaces';
import { PostingSignature } from '@genfeedai/models/content/posting-set.model';
import { PostingSignatureSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class PostingSignaturesService extends BaseService<
  PostingSignature,
  CreatePostingSignatureInput,
  UpdatePostingSignatureInput
> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.POSTING_SIGNATURES,
      token,
      PostingSignature,
      PostingSignatureSerializer,
    );
  }

  public static getInstance(token: string): PostingSignaturesService {
    return BaseService.getDataServiceInstance(PostingSignaturesService, token);
  }
}
