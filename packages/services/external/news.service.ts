import { API_ENDPOINTS } from '@genfeedai/contracts/constants';
import { News } from '@genfeedai/models/integrations/news.model';
import { BaseService } from '@services/core/base.service';

export class NewsService extends BaseService<News> {
  constructor(token: string) {
    super(API_ENDPOINTS.NEWS, token, News);
  }

  public static getInstance(token: string): NewsService {
    return BaseService.getDataServiceInstance(NewsService, token);
  }
}
