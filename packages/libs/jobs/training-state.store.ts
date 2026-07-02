import type { LoggerService } from '@libs/logger/logger.service';
import type { RedisService } from '@libs/redis/redis.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import type Redis from 'ioredis';

/** Redis record linking a training job to its spawned OS process. */
export interface TrainingProcessRecord {
  jobId: string;
  pid: number;
  startedAt: string;
}

/** Training state is transient operational state: expire after 24 hours. */
export const TRAINING_STATE_TTL_SECONDS = 86400;

/**
 * Redis persistence for ChildProcess-based training services.
 *
 * Persists job state (`training:{namespace}:job:{jobId}`) and live process
 * records (`training:{namespace}:process:{jobId}`) so a restarted service can
 * restore job history and detect orphaned training processes. All operations
 * degrade to no-ops when Redis is unavailable.
 */
export class TrainingStateStore<TJob extends { jobId: string }> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly namespace: string,
    private readonly loggerService: LoggerService,
    private readonly redisService?: RedisService,
  ) {}

  async persistJob(job: TJob): Promise<void> {
    await this.persist(this.buildJobKey(job.jobId), job);
  }

  async persistProcessRecord(record: TrainingProcessRecord): Promise<void> {
    await this.persist(this.buildProcessKey(record.jobId), record);
  }

  async deleteProcessRecord(jobId: string): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      await publisher.unlink(this.buildProcessKey(jobId));
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        jobId,
        message: 'Failed to delete training process record from Redis',
      });
    }
  }

  async loadJobs(): Promise<TJob[]> {
    return this.loadByPattern<TJob>(`training:${this.namespace}:job:*`);
  }

  async loadProcessRecords(): Promise<TrainingProcessRecord[]> {
    return this.loadByPattern<TrainingProcessRecord>(
      `training:${this.namespace}:process:*`,
    );
  }

  async loadJob(jobId: string): Promise<TJob | null> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return null;
    }

    try {
      const raw = await publisher.get(this.buildJobKey(jobId));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as TJob;
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        jobId,
        message: 'Failed to load training job from Redis',
      });
      return null;
    }
  }

  private buildJobKey(jobId: string): string {
    return `training:${this.namespace}:job:${jobId}`;
  }

  private buildProcessKey(jobId: string): string {
    return `training:${this.namespace}:process:${jobId}`;
  }

  private async persist(key: string, value: unknown): Promise<void> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return;
    }

    try {
      await publisher.setex(
        key,
        TRAINING_STATE_TTL_SECONDS,
        JSON.stringify(value),
      );
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        key,
        message: 'Failed to persist training state to Redis',
      });
    }
  }

  private async loadByPattern<TValue>(pattern: string): Promise<TValue[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publisher = this.redisService?.getPublisher();
    if (!publisher) {
      return [];
    }

    try {
      const keys = await this.collectKeys(publisher, pattern);
      const rawValues = await Promise.all(
        keys.map((key) => publisher.get(key)),
      );
      const values: TValue[] = [];

      for (const [index, raw] of rawValues.entries()) {
        if (!raw) {
          continue;
        }

        try {
          values.push(JSON.parse(raw) as TValue);
        } catch (error) {
          this.loggerService.warn(caller, {
            error: error instanceof Error ? error.message : String(error),
            key: keys[index],
            message: 'Skipping corrupt training state entry in Redis',
          });
        }
      }

      return values;
    } catch (error) {
      this.loggerService.warn(caller, {
        error: error instanceof Error ? error.message : String(error),
        message: 'Failed to load training state from Redis',
        pattern,
      });
      return [];
    }
  }

  private async collectKeys(
    publisher: Redis,
    pattern: string,
  ): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, foundKeys] = await publisher.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...foundKeys);
    } while (cursor !== '0');

    return keys;
  }
}
