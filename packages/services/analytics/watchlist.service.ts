import { Watchlist } from '@genfeedai/models/analytics/watchlist.model';
import { WatchlistSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class WatchlistService extends BaseService<Watchlist> {
  constructor(token: string) {
    super('/watchlists', token, Watchlist, WatchlistSerializer);
  }

  public static getInstance(token: string): WatchlistService {
    return BaseService.getDataServiceInstance(
      WatchlistService,
      token,
    ) as WatchlistService;
  }

  public async quickAdd(platform: string, handle: string): Promise<Watchlist> {
    return await this.instance
      .post('quick-add', { handle, platform })
      .then((res) => res.data)
      .then(async (res) => await this.mapOne(res));
  }
}
