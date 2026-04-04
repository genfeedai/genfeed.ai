vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@api/collections/posts/posts.module', () => ({
  PostsModule: class PostsModule {},
}));
vi.mock('@api/services/integrations/tiktok/tiktok.module', () => ({
  TiktokModule: class TiktokModule {},
}));

import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';

describe('CronTiktokModule', () => {
  it('should be defined', () => {
    expect(CronTiktokModule).toBeDefined();
  });
});
