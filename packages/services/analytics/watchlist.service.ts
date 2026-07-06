import type { WatchlistPlatform } from '@genfeedai/enums';
import { Watchlist } from '@genfeedai/models/analytics/watchlist.model';
import { WatchlistSerializer } from '@genfeedai/serializers';
import { BaseService } from '@services/core/base.service';

export class WatchlistService extends BaseService<Watchlist> {
  constructor(token: string) {
    super('/watchlists', token, Watchlist, WatchlistSerializer);
  }

  public static getInstance(token: string): WatchlistService {
    return BaseService.getDataServiceInstance(WatchlistService, token);
  }

  /**
   * Create a watchlist item with minimal data (auto-detected platform/handle).
   * The API applies server-side defaults (brand/organization/user/label) and
   * upserts: an existing item for the same brand/platform/handle is returned
   * instead of erroring.
   */
  public async quickAdd(platform: string, handle: string): Promise<Watchlist> {
    return this.post({
      handle,
      platform: platform as WatchlistPlatform,
    });
  }
}
