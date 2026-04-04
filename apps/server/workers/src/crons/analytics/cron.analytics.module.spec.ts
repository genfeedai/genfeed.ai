vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@api/collections/posts/posts.module', () => ({
  PostsModule: class PostsModule {},
}));
vi.mock('@api/services/integrations/instagram/instagram.module', () => ({
  InstagramModule: class InstagramModule {},
}));
vi.mock('@api/services/integrations/tiktok/tiktok.module', () => ({
  TiktokModule: class TiktokModule {},
}));
vi.mock('@api/services/integrations/twitter/twitter.module', () => ({
  TwitterModule: class TwitterModule {},
}));
vi.mock('@workers/queues/queues.module', () => ({
  WorkersQueuesModule: class WorkersQueuesModule {},
}));

import { CronAnalyticsModule } from '@workers/crons/analytics/cron.analytics.module';

describe('CronAnalyticsModule', () => {
  it('should be defined', () => {
    expect(CronAnalyticsModule).toBeDefined();
  });
});
