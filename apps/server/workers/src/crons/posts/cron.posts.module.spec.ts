// The module graph reaches `@workers/queues/queues.module`, whose ConfigModule
// instantiates the real ConfigService at import time. Seed the validated env
// before any import runs so the Joi schema passes.
vi.hoisted(() => {
  vi.stubEnv('NODE_ENV', 'test');
  process.env.PORT = process.env.PORT ?? '3013';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/genfeed';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
});

import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';

describe('CronPostsModule', () => {
  it('should be defined', () => {
    expect(CronPostsModule).toBeDefined();
  });
});
