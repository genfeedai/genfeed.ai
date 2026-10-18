import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { ElementBlacklist } from '@genfeedai/models/elements/blacklist.model';
import { BaseService } from '@services/core/base.service';

export class BlacklistsService extends BaseService<ElementBlacklist> {
  constructor(token: string) {
    super(API_ENDPOINTS.BLACKLISTS, token, ElementBlacklist);
  }

  public static getInstance(token: string): BlacklistsService {
    return BaseService.getDataServiceInstance(BlacklistsService, token);
  }
}
