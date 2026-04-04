vi.mock('@api/collections/settings/schemas/setting.schema', () => ({
  Setting: class Setting {},
  SettingSchema: {},
}));
vi.mock('@api/collections/trends/schemas/trend.schema', () => ({
  Trend: class Trend {},
  TrendSchema: {},
}));
vi.mock('@api/collections/trends/trends.module', () => ({
  TrendsModule: class TrendsModule {},
}));
vi.mock('@api/constants/database.constants', () => ({
  DB_CONNECTIONS: { AUTH: 'auth' },
}));
vi.mock('@api/services/cache/cache.module', () => ({
  CacheModule: class CacheModule {},
}));
vi.mock('@api/services/notifications/notifications.module', () => ({
  NotificationsModule: class NotificationsModule {},
}));

import { CronTrendsModule } from '@workers/crons/trends/cron.trends.module';

describe('CronTrendsModule', () => {
  it('should be defined', () => {
    expect(CronTrendsModule).toBeDefined();
  });
});
