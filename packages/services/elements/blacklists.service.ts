import { API_ENDPOINTS } from '@genfeedai/constants';
import { ElementBlacklist } from '@genfeedai/models/elements/blacklist.model';
import { BlacklistSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class BlacklistsService extends BaseService<ElementBlacklist> {
  constructor(token: string) {
    super(
      API_ENDPOINTS.BLACKLISTS,
      token,
      ElementBlacklist,
      BlacklistSerializer,
    );
  }

  public static getInstance(token: string): BlacklistsService {
    return BaseService.getDataServiceInstance(
      BlacklistsService,
      token,
    ) as BlacklistsService;
  }
}
