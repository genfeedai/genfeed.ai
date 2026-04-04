vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@api/services/integrations/facebook/facebook.module', () => ({
  FacebookModule: class FacebookModule {},
}));
vi.mock('@api/services/integrations/instagram/instagram.module', () => ({
  InstagramModule: class InstagramModule {},
}));
vi.mock('@api/services/integrations/linkedin/linkedin.module', () => ({
  LinkedInModule: class LinkedInModule {},
}));
vi.mock('@api/services/integrations/pinterest/pinterest.module', () => ({
  PinterestModule: class PinterestModule {},
}));
vi.mock('@api/services/integrations/reddit/reddit.module', () => ({
  RedditModule: class RedditModule {},
}));
vi.mock('@api/services/integrations/tiktok/tiktok.module', () => ({
  TiktokModule: class TiktokModule {},
}));
vi.mock('@api/services/integrations/twitter/twitter.module', () => ({
  TwitterModule: class TwitterModule {},
}));
vi.mock('@api/services/integrations/youtube/youtube.module', () => ({
  YoutubeModule: class YoutubeModule {},
}));

import { CronCredentialsModule } from '@workers/crons/credentials/cron.credentials.module';

describe('CronCredentialsModule', () => {
  it('should be defined', () => {
    expect(CronCredentialsModule).toBeDefined();
  });
});
