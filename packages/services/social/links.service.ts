import { API_ENDPOINTS } from '@genfeedai/constants';
import { Link } from '@genfeedai/models/social/link.model';
import { LinkSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class LinksService extends BaseService<Link> {
  constructor(token: string) {
    super(API_ENDPOINTS.LINKS, token, Link, LinkSerializer);
  }

  public static getInstance(token: string): LinksService {
    return BaseService.getDataServiceInstance(
      LinksService,
      token,
    ) as LinksService;
  }
}
