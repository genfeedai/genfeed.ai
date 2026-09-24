import { CacheClientService } from '@api/services/cache/cache-client.service';
import { CacheTagsService } from '@api/services/cache/cache-tags.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

export type ServiceCacheOptions = {
  tags?: string[];
  ttl?: number;
};

const SET_OWNED_CLAIM_VALUE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('SETEX', KEYS[2], ARGV[3], ARGV[2])
return 1
`;

const RELEASE_OWNED_CLAIM_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if #KEYS > 1 then
  redis.call('DEL', KEYS[2])
end
redis.call('DEL', KEYS[1])
return 1
`;

export type CounterBudgetReservationResult =
  | { status: 'reserved'; reserved: number; total: number }
  | { status: 'exhausted' }
  | { status: 'unavailable' };
export type CounterReservationReconciliationResult =
  | 'settled'
  | 'duplicate'
  | 'unavailable';

const COUNTER_INTEGER_SCRIPT = `
local MAX = 9007199254740991
local function integer(value)
  if type(value) ~= 'string' or not string.match(value, '^%d+$') then return nil end
  local number = tonumber(value)
  if not number or number < 0 or number > MAX or number % 1 ~= 0 then return nil end
  if string.format('%.0f', number) ~= value then return nil end
  return number
end
`;

const COUNTER_VALIDATION_SCRIPT = `${COUNTER_INTEGER_SCRIPT}
if redis.call('TYPE', KEYS[1]).ok ~= 'string' then return 0 end
local current = integer(redis.call('GET', KEYS[1]))
local ttl = redis.call('PTTL', KEYS[1])
if not current or ttl <= 0 then return 0 end
`;

const INITIALIZE_COUNTER_BUDGET_SCRIPT = `${COUNTER_INTEGER_SCRIPT}
local initial = integer(ARGV[1])
local ttl = integer(ARGV[2])
if not initial or not ttl or ttl <= 0 then return 0 end
local kind = redis.call('TYPE', KEYS[1]).ok
if kind == 'none' then
  if redis.call('EXISTS', KEYS[2]) ~= 0 then return 0 end
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
  redis.call('SET', KEYS[2], '1', 'EX', ARGV[2])
  return 1
end
if kind ~= 'string' then return 0 end
local remaining = redis.call('PTTL', KEYS[1])
if not integer(redis.call('GET', KEYS[1])) or remaining <= 0 then return 0 end
if redis.call('EXISTS', KEYS[2]) == 0 then
  redis.call('SET', KEYS[2], '1', 'PX', remaining)
end
return 1
`;

const RESERVE_COUNTER_BUDGET_SCRIPT = `${COUNTER_VALIDATION_SCRIPT}
local limit = integer(ARGV[1])
local requested = integer(ARGV[2])
if not limit or limit <= 0 or not requested or requested <= 0 then return 0 end
if redis.call('EXISTS', KEYS[2]) ~= 0 then return 0 end
if current >= limit then return {2} end
local reserved = math.min(requested, limit - current)
local amount = string.format('%.0f', reserved)
redis.call('INCRBY', KEYS[1], amount)
redis.call('HSET', KEYS[2], 'usageKey', KEYS[1], 'reserved', amount, 'state', 'reserved')
redis.call('PEXPIRE', KEYS[2], ttl)
return {1, amount, string.format('%.0f', current + reserved)}
`;

const RECONCILE_COUNTER_RESERVATION_SCRIPT = `${COUNTER_VALIDATION_SCRIPT}
if redis.call('TYPE', KEYS[2]).ok ~= 'hash' or redis.call('PTTL', KEYS[2]) <= 0 then return 0 end
local receipt = redis.call('HMGET', KEYS[2], 'usageKey', 'reserved', 'state', 'actualMicroUsd')
local reserved = integer(receipt[2])
local actual = integer(ARGV[2])
if receipt[1] ~= KEYS[1] or not reserved or reserved <= 0 or receipt[2] ~= ARGV[1] or not actual then return 0 end
if receipt[3] == 'settled' then
  if not integer(receipt[4]) then return 0 end
  return 2
end
if receipt[3] ~= 'reserved' then return 0 end
local delta = actual - reserved
if delta > 0 and current > MAX - delta then return 0 end
local final = current + delta
if final < 0 or final > MAX then return 0 end
redis.call('INCRBY', KEYS[1], string.format('%.0f', delta))
redis.call('HSET', KEYS[2], 'state', 'settled', 'actualMicroUsd', ARGV[2])
return 1
`;

const NOTE_RESEARCH_RESERVATION_SCRIPT = `${COUNTER_VALIDATION_SCRIPT}
local amount = integer(ARGV[1])
if not amount or amount <= 0 then return 0 end
if redis.call('TYPE', KEYS[2]).ok ~= 'hash' then return 0 end
if redis.call('HGET', KEYS[2], 'booksReserved') == '1' then return 2 end
local outstanding = integer(redis.call('GET', KEYS[3]) or '0')
if not outstanding or outstanding > MAX - amount then return 0 end
redis.call('SET', KEYS[3], string.format('%.0f', outstanding + amount), 'PX', ttl)
redis.call('HSET', KEYS[2], 'booksReserved', '1')
return 1
`;

const NOTE_SETTLED_RESEARCH_RESERVATION_SCRIPT = `${COUNTER_VALIDATION_SCRIPT}
if redis.call('TYPE', KEYS[2]).ok ~= 'hash' then return 0 end
if redis.call('HGET', KEYS[2], 'booksSettled') == '1' then return 2 end
if redis.call('HGET', KEYS[2], 'state') ~= 'settled' then return 0 end
if redis.call('HGET', KEYS[2], 'booksReserved') ~= '1' then return 0 end
local reserved = integer(redis.call('HGET', KEYS[2], 'reserved'))
local actual = integer(redis.call('HGET', KEYS[2], 'actualMicroUsd'))
local outstanding = integer(redis.call('GET', KEYS[3]) or '0')
local settled = integer(redis.call('GET', KEYS[4]) or '0')
if not reserved or not actual or not outstanding or not settled then return 0 end
if outstanding < reserved or settled > MAX - actual then return 0 end
redis.call('SET', KEYS[3], string.format('%.0f', outstanding - reserved), 'PX', ttl)
redis.call('SET', KEYS[4], string.format('%.0f', settled + actual), 'PX', ttl)
redis.call('HSET', KEYS[2], 'booksSettled', '1')
return 1
`;

const IMPORT_HOSTED_ACCOUNT_USAGE_SCRIPT = `${COUNTER_VALIDATION_SCRIPT}
local provider = integer(ARGV[1])
if provider == nil then return 0 end
local snapshotRaw = redis.call('GET', KEYS[2])
if not snapshotRaw then
  local outstanding = integer(redis.call('GET', KEYS[4]) or '0')
  if outstanding == nil then return 0 end
  local base = current - outstanding
  if base < 0 then base = 0 end
  local unexplained = provider - base
  if unexplained < 0 then
    redis.call('SET', KEYS[2], ARGV[1], 'PX', ttl)
    redis.call('SET', KEYS[3], '0', 'PX', ttl)
    return {3}
  end
  local ours = unexplained
  if ours > outstanding then ours = outstanding end
  local external = unexplained - ours
  if external > 0 then
    if current > MAX - external then return 0 end
    redis.call('INCRBY', KEYS[1], string.format('%.0f', external))
  end
  redis.call('SET', KEYS[2], string.format('%.0f', provider - ours), 'PX', ttl)
  redis.call('SET', KEYS[3], '0', 'PX', ttl)
  return {3}
end
local snapshot = integer(snapshotRaw)
local settled = integer(redis.call('GET', KEYS[3]) or '0')
local outstanding = integer(redis.call('GET', KEYS[4]) or '0')
if snapshot == nil or settled == nil or outstanding == nil then return 0 end
-- Provider usage can include our run before terminal settlement, and a
-- refresh can land between counter settlement and the outstanding-book note.
-- Attribute that overlap to the open reservation. Only the remainder is
-- external. Do not advance the snapshot through the attributed overlap, or
-- the later settlement is counted a second time.
local unexplained = provider - snapshot - settled
if unexplained < 0 then return {4} end
local ours = unexplained
if ours > outstanding then ours = outstanding end
local external = unexplained - ours
if external > 0 then
  if current > MAX - external then return 0 end
  redis.call('INCRBY', KEYS[1], string.format('%.0f', external))
end
redis.call('SET', KEYS[2], string.format('%.0f', provider - ours), 'PX', ttl)
redis.call('SET', KEYS[3], '0', 'PX', ttl)
if external > 0 then return {1, string.format('%.0f', external)} end
if unexplained == 0 then return {2} end
return {4}
`;

export type ResearchReservationNote = 'duplicate' | 'noted' | 'unavailable';
export type HostedAccountUsageImport =
  | { externalMicroUsd: number; status: 'applied' }
  | { status: 'baselined' | 'behind' | 'unchanged' | 'unavailable' };

@Injectable()
export class CacheService {
  private readonly defaultTtl = 300; // 5 minutes default
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheClientService: CacheClientService,
    private readonly cacheTagsService: CacheTagsService,
    private readonly logger: LoggerService,
  ) {}

  private get client(): Redis {
    return this.cacheClientService.instance;
  }

  /**
   * Whether the cache client can accept a command right now.
   *
   * The `try/catch` on every method below can only fail open on a *rejection*.
   * ioredis buffers commands in its offline queue while a client is
   * disconnected, so a command issued against an unreachable Redis does not
   * reject — it never settles at all, and since this client's reconnect is
   * unbounded by design (see `WorkloadRedisClientService`), nothing ever
   * releases it. A cached endpoint then hangs forever instead of serving
   * uncached, which is the opposite of the intended degradation.
   *
   * `isReady` is exposed by the client service for exactly this gate. Checking
   * it turns "Redis is unreachable" into an immediate cache miss.
   */
  private get isAvailable(): boolean {
    return this.cacheClientService.isReady;
  }

  private logOperationError(
    operation: string,
    details: Parameters<LoggerService['error']>[1],
  ): void {
    this.logger.error(`${this.constructorName} ${operation} error`, details);
  }

  async initializeCounterBudget(
    usageKey: string,
    initialMicroUsd: number,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (
      !this.isAvailable ||
      !usageKey ||
      !Number.isSafeInteger(initialMicroUsd) ||
      initialMicroUsd < 0 ||
      !Number.isSafeInteger(ttlSeconds) ||
      ttlSeconds <= 0
    )
      return false;
    try {
      return (
        (await this.client.eval(
          INITIALIZE_COUNTER_BUDGET_SCRIPT,
          2,
          usageKey,
          `${usageKey}:initialized`,
          String(initialMicroUsd),
          String(ttlSeconds),
        )) === 1
      );
    } catch (error: unknown) {
      this.logOperationError('initializeCounterBudget', { error });
      return false;
    }
  }

  async reserveCounterBudget(
    usageKey: string,
    reservationKey: string,
    limit: number,
    requested: number,
  ): Promise<CounterBudgetReservationResult> {
    if (
      !this.isAvailable ||
      !usageKey ||
      !reservationKey ||
      usageKey === reservationKey ||
      !Number.isSafeInteger(limit) ||
      limit <= 0 ||
      !Number.isSafeInteger(requested) ||
      requested <= 0
    ) {
      return { status: 'unavailable' };
    }
    try {
      const result = await this.client.eval(
        RESERVE_COUNTER_BUDGET_SCRIPT,
        2,
        usageKey,
        reservationKey,
        String(limit),
        String(requested),
      );
      if (Array.isArray(result) && result[0] === 2)
        return { status: 'exhausted' };
      if (Array.isArray(result) && result[0] === 1) {
        const reserved = Number(result[1]);
        const total = Number(result[2]);
        if (
          Number.isSafeInteger(reserved) &&
          reserved > 0 &&
          Number.isSafeInteger(total) &&
          total >= reserved &&
          total <= limit
        ) {
          return { status: 'reserved', reserved, total };
        }
      }
    } catch (error: unknown) {
      this.logOperationError('reserveCounterBudget', { error });
    }
    return { status: 'unavailable' };
  }

  async reconcileCounterReservation(
    usageKey: string,
    reservationKey: string,
    reserved: number,
    actual: number,
  ): Promise<CounterReservationReconciliationResult> {
    if (
      !this.isAvailable ||
      !usageKey ||
      !reservationKey ||
      usageKey === reservationKey ||
      !Number.isSafeInteger(reserved) ||
      reserved <= 0 ||
      !Number.isSafeInteger(actual) ||
      actual < 0
    )
      return 'unavailable';
    try {
      const result = await this.client.eval(
        RECONCILE_COUNTER_RESERVATION_SCRIPT,
        2,
        usageKey,
        reservationKey,
        String(reserved),
        String(actual),
      );
      if (result === 1) return 'settled';
      if (result === 2) return 'duplicate';
    } catch (error: unknown) {
      this.logOperationError('reconcileCounterReservation', { error });
    }
    return 'unavailable';
  }

  /**
   * Record a hosted reservation in the account ledger. Duplicate calls for
   * the same reservation hash do not add the amount twice.
   */
  async noteResearchReservation(
    usageKey: string,
    reservationKey: string,
    reservedMicroUsd: number,
  ): Promise<ResearchReservationNote> {
    return this.evalResearchNote(
      NOTE_RESEARCH_RESERVATION_SCRIPT,
      [usageKey, reservationKey, `${usageKey}:outstanding`],
      [String(reservedMicroUsd)],
      reservedMicroUsd > 0,
    );
  }

  /**
   * Move a settled reservation from outstanding into settled charges.
   * A duplicate settlement does not change the ledger.
   */
  async noteSettledResearchReservation(
    usageKey: string,
    reservationKey: string,
  ): Promise<ResearchReservationNote> {
    return this.evalResearchNote(
      NOTE_SETTLED_RESEARCH_RESERVATION_SCRIPT,
      [
        usageKey,
        reservationKey,
        `${usageKey}:outstanding`,
        `${usageKey}:settled`,
      ],
      [],
      true,
    );
  }

  /**
   * Fold provider-account usage into the hosted counter. Growth that fits
   * inside open reservations is not external, including a reading that
   * arrives before terminal settlement or between the counter settlement
   * and the outstanding-book note. Only the remainder is added, once.
   */
  async importHostedAccountUsage(
    usageKey: string,
    providerMicroUsd: number,
  ): Promise<HostedAccountUsageImport> {
    if (
      !this.isAvailable ||
      !usageKey ||
      !Number.isSafeInteger(providerMicroUsd) ||
      providerMicroUsd < 0
    ) {
      return { status: 'unavailable' };
    }
    try {
      const result = await this.client.eval(
        IMPORT_HOSTED_ACCOUNT_USAGE_SCRIPT,
        4,
        usageKey,
        `${usageKey}:snapshot`,
        `${usageKey}:settled`,
        `${usageKey}:outstanding`,
        String(providerMicroUsd),
      );
      if (Array.isArray(result) && result[0] === 1) {
        const external = Number(result[1]);
        if (Number.isSafeInteger(external) && external > 0) {
          return { externalMicroUsd: external, status: 'applied' };
        }
      }
      if (Array.isArray(result) && result[0] === 2) {
        return { status: 'unchanged' };
      }
      if (Array.isArray(result) && result[0] === 3) {
        return { status: 'baselined' };
      }
      if (Array.isArray(result) && result[0] === 4) {
        return { status: 'behind' };
      }
    } catch (error: unknown) {
      this.logOperationError('importHostedAccountUsage', { error });
    }
    return { status: 'unavailable' };
  }

  private async evalResearchNote(
    script: string,
    keys: string[],
    args: string[],
    isValid: boolean,
  ): Promise<ResearchReservationNote> {
    if (!this.isAvailable || !isValid || keys.some((key) => !key)) {
      return 'unavailable';
    }
    try {
      const result = await this.client.eval(
        script,
        keys.length,
        ...keys,
        ...args,
      );
      if (result === 1) return 'noted';
      if (result === 2) return 'duplicate';
    } catch (error: unknown) {
      this.logOperationError('evalResearchNote', { error });
    }
    return 'unavailable';
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isAvailable) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error: unknown) {
      this.logOperationError('get', { error, key });
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    options: ServiceCacheOptions = {},
  ): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const ttl = options.ttl || this.defaultTtl;

      await this.client.setex(key, ttl, serialized);
      await this.cacheTagsService.setTags(key, options.tags ?? []);
      return true;
    } catch (error: unknown) {
      this.logOperationError('set', { error, key });
      return false;
    }
  }

  /**
   * Atomically read and delete `key` in a single round trip (Redis `GETDEL`).
   * Prefer this over a separate `get` + `del` pair for single-use records —
   * two callers racing a get-then-del can both read the value before either
   * delete lands, breaking "consumed exactly once" semantics. `GETDEL` is
   * server-side atomic, so only one caller ever gets the value back.
   */
  async getdel<T = unknown>(key: string): Promise<T | null> {
    if (!this.isAvailable) {
      return null;
    }

    try {
      const value = await this.client.getdel(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error: unknown) {
      this.logOperationError('getdel', { error, key });
      return null;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      return (await this.client.del(key)) > 0;
    } catch (error: unknown) {
      this.logOperationError('del', { error, key });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      return (await this.client.exists(key)) === 1;
    } catch (error: unknown) {
      this.logOperationError('exists', { error, key });
      return false;
    }
  }

  async incr(key: string, by: number = 1): Promise<number> {
    if (!this.isAvailable) {
      return 0;
    }

    try {
      return await this.client.incrby(key, by);
    } catch (error: unknown) {
      this.logOperationError('incr', {
        by,
        error,
        key,
      });
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      return (await this.client.expire(key, ttl)) === 1;
    } catch (error: unknown) {
      this.logOperationError('expire', {
        error,
        key,
        ttl,
      });
      return false;
    }
  }

  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (!this.isAvailable) {
      return keys.map(() => null);
    }

    try {
      const values = await this.client.mget(keys);
      return values.map((value) => (value ? (JSON.parse(value) as T) : null));
    } catch (error: unknown) {
      this.logOperationError('mget', { error, keys });
      return keys.map(() => null);
    }
  }

  async mset(
    keyValues: Record<string, unknown>,
    ttl?: number,
  ): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const pipeline = this.client.multi();

      Object.entries(keyValues).forEach(([key, value]) => {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });

      await pipeline.exec();
      return true;
    } catch (error: unknown) {
      this.logOperationError('mset', {
        error,
        keyValues,
      });
      return false;
    }
  }

  invalidateByTags(tags: string[]): Promise<number> {
    if (!this.isAvailable) {
      return Promise.resolve(0);
    }

    return this.cacheTagsService.invalidateByTags(tags);
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: ServiceCacheOptions = {},
  ): Promise<T> {
    try {
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      const value = await factory();
      await this.set(key, value, options);
      return value;
    } catch (error: unknown) {
      this.logOperationError('getOrSet', {
        error,
        key,
      });
      return await factory();
    }
  }

  async getOrSetWithLock<T>(
    key: string,
    factory: () => Promise<T | undefined>,
    options: ServiceCacheOptions = {},
    lockTtlSeconds: number = 5,
  ): Promise<T | undefined> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const lockKey = `cache-populate:${key}`;
    const acquired = await this.acquireLock(lockKey, lockTtlSeconds);

    if (acquired) {
      try {
        const doubleCheck = await this.get<T>(key);
        if (doubleCheck !== null) {
          return doubleCheck;
        }

        const value = await factory();
        if (value !== undefined) {
          await this.set(key, value, options);
        }
        return value;
      } finally {
        await this.releaseLock(lockKey);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
    const retryCache = await this.get<T>(key);
    if (retryCache !== null) {
      return retryCache;
    }

    this.logger.debug(
      `${this.constructorName} getOrSetWithLock fallback for ${key}`,
    );
    const value = await factory();
    if (value !== undefined) {
      await this.set(key, value, options);
    }
    return value;
  }

  async flush(): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      await this.client.flushdb();
      this.logger.warn(`${this.constructorName} cache flushed`);
      return true;
    } catch (error: unknown) {
      this.logOperationError('flush', error);
      return false;
    }
  }

  generateKey(namespace: string, ...parts: (string | number)[]): string {
    return `${namespace}:${parts.join(':')}`;
  }

  /**
   * Acquire a distributed lock using Redis SET NX with TTL.
   * Returns true if lock was acquired, false if already held by another process.
   *
   * @param lockKey - Unique identifier for the lock
   * @param ttlSeconds - Lock expiration time (prevents deadlocks if process crashes)
   */
  async acquireLock(
    lockKey: string,
    ttlSeconds: number = 300,
  ): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const key = `lock:${lockKey}`;
      // SET NX (only set if not exists) with EX (expiration in seconds)
      const result = await this.client.set(
        key,
        Date.now().toString(),
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (error: unknown) {
      this.logOperationError('acquireLock', {
        error,
        lockKey,
      });
      return false;
    }
  }

  async acquireOwnedClaim(
    key: string,
    token: string,
    ttlSeconds: number,
  ): Promise<'claimed' | 'duplicate' | 'unavailable'> {
    if (!this.isAvailable) return 'unavailable';
    try {
      const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
      return result === 'OK' ? 'claimed' : 'duplicate';
    } catch (error: unknown) {
      this.logOperationError('acquireOwnedClaim', { error, key });
      return 'unavailable';
    }
  }

  /** Write a result only while the caller still owns the expiring claim. */
  async setOwnedClaimValue(
    claimKey: string,
    token: string,
    resultKey: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<boolean> {
    if (!this.isAvailable) return false;
    try {
      return (
        (await this.client.eval(
          SET_OWNED_CLAIM_VALUE_SCRIPT,
          2,
          claimKey,
          resultKey,
          token,
          JSON.stringify(value),
          ttlSeconds,
        )) === 1
      );
    } catch (error: unknown) {
      this.logOperationError('setOwnedClaimValue', {
        error,
        claimKey,
        resultKey,
      });
      return false;
    }
  }

  /** Expired work cannot release a successor's claim or delete its result. */
  async releaseOwnedClaim(
    claimKey: string,
    token: string,
    resultKeyToDelete?: string,
  ): Promise<boolean> {
    if (!this.isAvailable) return false;
    try {
      const keys = resultKeyToDelete
        ? [claimKey, resultKeyToDelete]
        : [claimKey];
      return (
        (await this.client.eval(
          RELEASE_OWNED_CLAIM_SCRIPT,
          keys.length,
          ...keys,
          token,
        )) === 1
      );
    } catch (error: unknown) {
      this.logOperationError('releaseOwnedClaim', {
        error,
        claimKey,
        resultKeyToDelete,
      });
      return false;
    }
  }

  /**
   * Claim `key` exactly once inside `ttlSeconds`, reporting the three outcomes
   * separately.
   *
   * `acquireLock` cannot serve this: it collapses "already held" and "Redis is
   * unreachable" into the same `false`. Idempotency guards need them apart —
   * treating an unreachable cache as "already seen" would silently discard
   * every inbound event for the duration of the outage, which is a far worse
   * failure than handling one event twice.
   *
   * Claims normally expire with the window; a caller whose processing fails
   * after claiming may `del` the key so the sender's retry is not suppressed.
   *
   * @param key - Namespaced identity of the thing being claimed
   * @param ttlSeconds - How long the claim suppresses repeats
   * @param tags - Cache tags that own a successful claim
   */
  async claimOnce(
    key: string,
    ttlSeconds: number,
    tags: string[] = [],
  ): Promise<'claimed' | 'duplicate' | 'unavailable'> {
    if (!this.isAvailable) {
      return 'unavailable';
    }

    try {
      const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');

      if (result !== 'OK') {
        return 'duplicate';
      }

      await this.cacheTagsService.setTags(key, tags);
      return 'claimed';
    } catch (error: unknown) {
      this.logOperationError('claimOnce', { error, key });
      return 'unavailable';
    }
  }

  /**
   * Release a distributed lock.
   *
   * @param lockKey - The lock identifier to release
   */
  async releaseLock(lockKey: string): Promise<boolean> {
    if (!this.isAvailable) {
      return false;
    }

    try {
      const key = `lock:${lockKey}`;
      return (await this.client.del(key)) > 0;
    } catch (error: unknown) {
      this.logOperationError('releaseLock', {
        error,
        lockKey,
      });
      return false;
    }
  }

  /**
   * Execute a function while holding a distributed lock.
   * Automatically acquires lock before execution and releases after.
   * If lock cannot be acquired, returns null without executing the function.
   *
   * @param lockKey - Unique identifier for the lock
   * @param fn - Function to execute while holding the lock
   * @param ttlSeconds - Lock expiration time (default: 5 minutes)
   */
  async withLock<T>(
    lockKey: string,
    fn: () => Promise<T>,
    ttlSeconds: number = 300,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(lockKey, ttlSeconds);
    if (!acquired) {
      this.logger.debug(
        `${this.constructorName} withLock: lock not acquired for ${lockKey}`,
      );
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockKey);
    }
  }
}
