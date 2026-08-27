vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@workers/services/social-integrations.module', () => ({
  SocialIntegrationsModule: class SocialIntegrationsModule {},
}));

import { CronCredentialsModule } from '@workers/crons/credentials/cron.credentials.module';

describe('CronCredentialsModule', () => {
  it('should be defined', () => {
    expect(CronCredentialsModule).toBeDefined();
  });
});
