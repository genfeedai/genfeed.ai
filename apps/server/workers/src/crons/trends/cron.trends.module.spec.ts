vi.mock('@api/services/cache/cache.module', () => ({
  CacheModule: class CacheModule {},
}));

import { CronTrendsModule } from '@workers/crons/trends/cron.trends.module';

describe('CronTrendsModule', () => {
  it('should be defined', () => {
    expect(CronTrendsModule).toBeDefined();
  });
});
