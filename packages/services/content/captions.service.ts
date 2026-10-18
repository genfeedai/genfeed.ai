import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { Caption } from '@genfeedai/models/content/caption.model';
import { BaseService } from '@services/core/base.service';

export class CaptionsService extends BaseService<Caption> {
  constructor(token: string) {
    super(API_ENDPOINTS.CAPTIONS, token, Caption);
  }

  public static getInstance(token: string): CaptionsService {
    return BaseService.getDataServiceInstance(CaptionsService, token);
  }
}
