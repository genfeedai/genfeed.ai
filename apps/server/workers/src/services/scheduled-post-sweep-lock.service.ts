import { randomUUID } from 'node:crypto';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';
import { SCHEDULED_POST_SWEEP_LOCK_TTL_MS } from '@workers/services/scheduled-post.constants';

const LOCK_KEY = 'genfeed:lock:scheduled-post-sweep';

const EXTEND_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface ScheduledPostSweepLease {
  /** Keeps the lock while the run is still paging; false once it was lost. */
  extend(): Promise<boolean>;
  release(): Promise<void>;
}

/**
 * One sweep run at a time across every worker process. A run still paging
 * through a burst holds the lock, so the next minute's tick does not start a
 * second run over the same posts.
 */
@Injectable()
export class ScheduledPostSweepLockService {
  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  /** The lease, or null when another run holds the lock. */
  async acquire(): Promise<ScheduledPostSweepLease | null> {
    const redis = this.redisService.getPublisher();
    // No shared Redis (single-process desktop): there is no second run to
    // exclude, and the job id still dedupes.
    if (!redis) return { extend: async () => true, release: async () => {} };

    const token = randomUUID();
    const acquired = await redis.set(
      LOCK_KEY,
      token,
      'PX',
      SCHEDULED_POST_SWEEP_LOCK_TTL_MS,
      'NX',
    );
    if (acquired !== 'OK') return null;

    return {
      extend: async () => {
        try {
          return (
            (await redis.eval(
              EXTEND_SCRIPT,
              1,
              LOCK_KEY,
              token,
              SCHEDULED_POST_SWEEP_LOCK_TTL_MS,
            )) === 1
          );
        } catch (error: unknown) {
          this.logger.warn('Scheduled post sweep lock renewal failed', {
            error,
          });
          return false;
        }
      },
      release: async () => {
        try {
          await redis.eval(RELEASE_SCRIPT, 1, LOCK_KEY, token);
        } catch (error: unknown) {
          // The lock expires on its own after the TTL.
          this.logger.warn('Scheduled post sweep lock release failed', {
            error,
          });
        }
      },
    };
  }
}
