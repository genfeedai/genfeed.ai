import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { QueueService } from '@api/queues/core/queue.service';
import {
  DEFAULT_QUEUE,
  type QueueDispatchResult,
} from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { Public } from '@libs/decorators/public.decorator';
import { RedisDriver, resolveRedisDriver } from '@libs/redis/redis-driver';
import { Controller, Get } from '@nestjs/common';

interface QueueCapability {
  /** Whether background work can reach a worker in this deployment. */
  canEnqueue: boolean;
  /** Which Redis driver this process resolved at boot. */
  driver: RedisDriver;
  /**
   * The literal {@link QueueDispatchResult} a caller would receive. Only
   * populated when no broker exists — see the controller doc for why.
   */
  probe?: QueueDispatchResult;
}

/**
 * Queue capability probe (#2382).
 *
 * Makes the queue-degradation contract observable without a logged-in session,
 * so "does this deployment have background workers?" is answerable by the
 * desktop shell at startup and by a reviewer with a single request.
 *
 * The probe only performs a real {@link QueueService.dispatch} when the resolved
 * driver has no broker — there, dispatch is provably side-effect-free, because
 * it short-circuits to a degraded result before touching BullMQ. Where a broker
 * *does* exist this endpoint reports capability only, so a public route can
 * never be used to push jobs onto a production queue.
 *
 * Carries `@Cache` so the response-cache path is exercised on a route that is
 * reachable without auth: with no Redis the interceptor fails open and the
 * endpoint still serves, uncached.
 */
@Public()
@Controller('queues')
export class QueueDiagnosticsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  @Get('capability')
  @Cache({
    keyGenerator: () => 'queues:capability',
    tags: ['queues'],
    ttl: 30,
  })
  async getCapability(): Promise<QueueCapability> {
    const driver = resolveRedisDriver(this.configService);
    const canEnqueue = driver !== RedisDriver.IN_PROCESS;

    if (canEnqueue) {
      return { canEnqueue, driver };
    }

    return {
      canEnqueue,
      driver,
      probe: await this.queueService.dispatch(DEFAULT_QUEUE, {
        reason: 'capability-probe',
      }),
    };
  }
}
