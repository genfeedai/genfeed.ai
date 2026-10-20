import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { LoggerService } from '@libs/logger/logger.service';

/**
 * Tells every open tab the new spendable balance after a hold moves. Runs
 * after the wallet transaction commits and never fails the billing step: the
 * balance chip also refetches on focus, so a missed event is only late.
 * `balance` is the spendable amount when the caller holds it, else a reader.
 */
export async function publishAvailableBalance(
  websocketService: NotificationsPublisherService,
  loggerService: LoggerService,
  organizationId: string,
  balance: number | (() => Promise<number>),
): Promise<void> {
  try {
    const available = typeof balance === 'number' ? balance : await balance();
    await websocketService.emit(`/credits/${organizationId}`, {
      balance: available,
    });
  } catch (error: unknown) {
    loggerService.warn('CreditsUtilsService failed to publish wallet balance', {
      error,
      organizationId,
    });
  }
}
