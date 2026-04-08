import { API_ENDPOINTS } from '@genfeedai/constants';
import { BlacklistSerializer } from '@genfeedai/serializers';
import { ElementBlacklist } from '@models/elements/blacklist.model';
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
