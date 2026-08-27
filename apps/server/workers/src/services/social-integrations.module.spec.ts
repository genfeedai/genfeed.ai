import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

describe('SocialIntegrationsModule', () => {
  it('is the workers Nest module for extracted social integration services', () => {
    expect(SocialIntegrationsModule).toBeDefined();
  });
});
