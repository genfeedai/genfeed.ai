import { API_ENDPOINTS } from '@genfeedai/constants';
import { Caption } from '@genfeedai/models/content/caption.model';
import { CaptionSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class CaptionsService extends BaseService<Caption> {
  constructor(token: string) {
    super(API_ENDPOINTS.CAPTIONS, token, Caption, CaptionSerializer);
  }

  public static getInstance(token: string): CaptionsService {
    return BaseService.getDataServiceInstance(
      CaptionsService,
      token,
    ) as CaptionsService;
  }
}
