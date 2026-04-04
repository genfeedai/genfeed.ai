vi.mock('@api/collections/posts/posts.module', () => ({
  PostsModule: class PostsModule {},
}));
vi.mock('@api/services/integrations/youtube/youtube.module', () => ({
  YoutubeModule: class YoutubeModule {},
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
