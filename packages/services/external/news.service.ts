import { NewsSerializer } from '@genfeedai/client/serializers';
import { API_ENDPOINTS } from '@genfeedai/constants';
import { News } from '@models/integrations/news.model';
import { BaseService } from '@services/core/base.service';

export class NewsService extends BaseService<News> {
  constructor(token: string) {
    super(API_ENDPOINTS.NEWS, token, News, NewsSerializer);
  }

  public static getInstance(token: string): NewsService {
    return BaseService.getDataServiceInstance(
      NewsService,
      token,
    ) as NewsService;
  }
}
