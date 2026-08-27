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
