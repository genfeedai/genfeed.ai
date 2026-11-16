import {
  type PublisherLimit,
  resolvePublisherLimit,
} from '@api/services/integrations/publishers/publisher-limits';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable } from '@nestjs/common';

/**
 * Longest a publish may hold its slot if the worker dies without releasing it.
 * Normal completion releases the slot at once; this only bounds a crash.
 */
const PUBLISH_GATE_LEASE_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
/** Wait before a publish held at the concurrency ceiling asks again. */
const PUBLISH_GATE_CONCURRENCY_RETRY_MS = 2_000;
const RETRY_JITTER_MS = 3_000;

export type PublishGateDecision =
  | { isAdmitted: true }
  | { isAdmitted: false; reason: 'concurrency' | 'rate'; retryAfterMs: number };

/**
 * One atomic step per provider: drop expired leases and old admissions, then
 * admit the job only if it is under both ceilings. The clock is Redis's own, so
 * worker processes with skewed clocks agree.
 *
 * KEYS[1] leases (score = lease expiry), KEYS[2] admissions (score = start).
 * ARGV: jobId, concurrency, ratePerMinute, leaseMs, windowMs, retryMs.
 * Returns {admitted, reasonCode, retryAfterMs}; reasonCode 1 = concurrency,
 * 2 = rate.
 */
const ADMIT_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - window)
if redis.call('ZSCORE', KEYS[1], ARGV[1]) then
  redis.call('ZADD', KEYS[1], now + tonumber(ARGV[4]), ARGV[1])
  return {1, 0, 0}
end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then
  return {0, 1, tonumber(ARGV[6])}
end
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0, 'WITHSCORES')
  return {0, 2, math.max(tonumber(oldest[2]) + window - now, 1)}
end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[4]), ARGV[1])
redis.call('ZADD', KEYS[2], now, ARGV[1] .. ':' .. now)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[4]) + window)
redis.call('PEXPIRE', KEYS[2], window * 2)
return {1, 0, 0}
`;

function gateKeys(provider: string): [string, string] {
  // The braces keep both keys on one cluster slot, as the script needs.
  const base = `genfeed:publish-gate:{${provider}}`;
  return [`${base}:leases`, `${base}:admissions`];
}

/**
 * A concurrency and rate ceiling per publishing provider, shared by every
 * worker process through Redis. A held publish is the caller's to delay; this
 * service never fails a publish and never counts as an attempt.
 */
@Injectable()
export class PublishProviderGateService {
  private readonly context = { service: PublishProviderGateService.name };

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: LoggerService,
  ) {}

  async admit(
    provider: string,
    jobId: string,
    limit: PublisherLimit = resolvePublisherLimit(provider),
  ): Promise<PublishGateDecision> {
    const redis = this.redisService.getPublisher();
    // Without Redis there is nothing shared to count against; the worker's own
    // concurrency still bounds the load, and BullMQ needs Redis anyway.
    if (!redis) return { isAdmitted: true };

    try {
      const [admitted, reasonCode, retryAfterMs] = (await redis.eval(
        ADMIT_SCRIPT,
        2,
        ...gateKeys(provider),
        jobId,
        limit.concurrency,
        limit.ratePerMinute,
        PUBLISH_GATE_LEASE_MS,
        RATE_WINDOW_MS,
        PUBLISH_GATE_CONCURRENCY_RETRY_MS,
      )) as [number, number, number];
      if (admitted === 1) return { isAdmitted: true };
      return {
        isAdmitted: false,
        reason: reasonCode === 2 ? 'rate' : 'concurrency',
        // Jitter so held jobs of one provider do not all ask on the same tick.
        retryAfterMs:
          Number(retryAfterMs) + Math.floor(Math.random() * RETRY_JITTER_MS),
      };
    } catch (error: unknown) {
      // A gate outage must not stop publishing: fail open and say so.
      this.logger.warn('Publish provider gate unavailable; admitting', {
        ...this.context,
        error,
        provider,
      });
      return { isAdmitted: true };
    }
  }

  async release(provider: string, jobId: string): Promise<void> {
    const redis = this.redisService.getPublisher();
    if (!redis) return;
    try {
      await redis.zrem(gateKeys(provider)[0], jobId);
    } catch (error: unknown) {
      // The lease expires on its own after `PUBLISH_GATE_LEASE_MS`.
      this.logger.warn('Publish provider gate release failed', {
        ...this.context,
        error,
        provider,
      });
    }
  }
}
