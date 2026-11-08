import {
  AvatarTwinsService,
  type AvatarTwinTrackingTotals,
} from '@api/collections/avatar-twins/services/avatar-twins.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Every two minutes; each twin is re-read on its own, slower step (#9683). */
export const AVATAR_TWIN_TRACKING_SCHEDULE = '*/2 * * * *';

/**
 * Moves digital twins forward while nobody has the page open: training and
 * consent settle at the provider, and the person is told in the bell.
 */
@Injectable()
export class CronAvatarTwinsService {
  private readonly context = 'CronAvatarTwinsService';

  constructor(
    private readonly avatarTwins: AvatarTwinsService,
    private readonly logger: LoggerService,
  ) {}

  async trackWaitingTwins(): Promise<AvatarTwinTrackingTotals> {
    const totals = await this.avatarTwins.trackWaiting();
    if (totals.checked > 0 || totals.interrupted > 0)
      this.logger.log('Avatar twins checked', {
        ...totals,
        context: this.context,
      });
    return totals;
  }
}
