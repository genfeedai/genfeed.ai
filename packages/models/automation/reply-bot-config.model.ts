import type { IReplyBotConfig, IReplyBotRateLimits } from '@cloud/interfaces';
import { ReplyBotConfig as BaseReplyBotConfig } from '@genfeedai/client/models';

function normalizeRateLimits(
  rateLimits?: Partial<IReplyBotRateLimits>,
): IReplyBotRateLimits {
  return {
    currentDayCount: rateLimits?.currentDayCount ?? 0,
    currentHourCount: rateLimits?.currentHourCount ?? 0,
    dayResetAt: rateLimits?.dayResetAt,
    hourResetAt: rateLimits?.hourResetAt,
    maxRepliesPerAccountPerDay: rateLimits?.maxRepliesPerAccountPerDay ?? 5,
    maxRepliesPerDay: rateLimits?.maxRepliesPerDay ?? 50,
    maxRepliesPerHour: rateLimits?.maxRepliesPerHour ?? 10,
  };
}

export class ReplyBotConfig extends BaseReplyBotConfig {
  constructor(partial: Partial<IReplyBotConfig> = {}) {
    super(partial);

    this.rateLimits = normalizeRateLimits(partial.rateLimits);
    this.monitoredAccounts = [...(partial.monitoredAccounts ?? [])];
    this.totalRepliesSent = partial.totalRepliesSent ?? 0;
    this.totalDmsSent = partial.totalDmsSent ?? 0;
    this.totalSkipped = partial.totalSkipped ?? 0;
    this.totalFailed = partial.totalFailed ?? 0;
  }
}
