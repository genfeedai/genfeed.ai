import { AsyncLocalStorage } from 'node:async_hooks';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import {
  ConflictException,
  Injectable,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';

type ReviewLockContext = { keys: ReadonlySet<string>; active: boolean };

/** A dedicated lock transaction outlives nested publishing transactions. */
@Injectable()
export class BatchReviewLockService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly held = new AsyncLocalStorage<ReviewLockContext>();

  constructor(config: ConfigService, logger: LoggerService) {
    const databaseUrl = config.get('DATABASE_URL');
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    this.pool = new Pool({
      ...createPrismaPgConfig(databaseUrl, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => config.get(key)),
      }),
      max: 2,
      min: 0,
    });
    this.pool.on('error', () =>
      logger.warn('Batch review lock connection failed'),
    );
  }

  assertActive(): void {
    const context = this.held.getStore();
    if (context && !context.active)
      throw new ConflictException(
        'The review lock was lost. Reload before retrying.',
      );
  }

  async run<T>(
    batchIds: string[],
    organizationId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const keys = [...new Set(batchIds)]
      .sort()
      .map((id) => `batch-review:${organizationId}:${id}`);
    const parent = this.held.getStore();
    if (parent) {
      this.assertActive();
      if (!keys.every((key) => parent.keys.has(key)))
        throw new ConflictException(
          'A nested operation cannot expand its review lock.',
        );
      return operation();
    }
    if (!keys.length) return operation();
    const client = await this.pool.connect();
    const context: ReviewLockContext = { keys: new Set(keys), active: true };
    const lost = () => {
      context.active = false;
    };
    client.on('error', lost);
    let destroy = false;
    try {
      await client.query('BEGIN');
      const deadline = Date.now() + 5000;
      for (const key of keys) {
        for (;;) {
          if (!context.active)
            throw new ConflictException('The review lock connection was lost.');
          const result = await client.query<{ acquired: boolean }>(
            'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
            [key],
          );
          if (result.rows[0]?.acquired) {
            break;
          }
          if (Date.now() >= deadline)
            throw new ConflictException('This review is updating. Try again.');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      return await this.held.run(context, async () => {
        this.assertActive();
        const result = await operation();
        this.assertActive();
        return result;
      });
    } finally {
      destroy = !context.active;
      context.active = false;
      try {
        await client.query('ROLLBACK');
      } catch {
        destroy = true;
      }
      client.removeListener('error', lost);
      client.release(destroy);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
