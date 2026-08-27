vi.mock('@workers/services/social-integrations.module', () => ({
  SocialIntegrationsModule: class SocialIntegrationsModule {},
}));

import { CronTiktokModule } from '@workers/crons/tiktok/cron.tiktok.module';

describe('CronTiktokModule', () => {
  it('should be defined', () => {
    expect(CronTiktokModule).toBeDefined();
  });
});
