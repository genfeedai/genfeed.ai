vi.mock('@api/collections/posts/posts.module', () => ({
  PostsModule: class PostsModule {},
}));
vi.mock('@api/collections/social-inbox/social-inbox.module', () => ({
  SocialInboxModule: class SocialInboxModule {},
}));
vi.mock('@workers/services/social-integrations.module', () => ({
  SocialIntegrationsModule: class SocialIntegrationsModule {},
}));
vi.mock('@workers/queues/queues.module', () => ({
  WorkersQueuesModule: class WorkersQueuesModule {},
}));

import { CronYoutubeModule } from '@workers/crons/youtube/cron.youtube.module';

describe('CronYoutubeModule', () => {
  it('should be defined', () => {
    expect(CronYoutubeModule).toBeDefined();
  });
});
