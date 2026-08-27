vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@api/collections/posts/posts.module', () => ({
  PostsModule: class PostsModule {},
}));
vi.mock('@workers/services/social-integrations.module', () => ({
  SocialIntegrationsModule: class SocialIntegrationsModule {},
}));

import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';

describe('CronTiktokModule', () => {
  it('should be defined', () => {
    expect(CronTiktokModule).toBeDefined();
  });
});
