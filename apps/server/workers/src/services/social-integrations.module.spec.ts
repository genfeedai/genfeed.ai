import { MODULE_METADATA } from '@nestjs/common/constants';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

describe('SocialIntegrationsModule', () => {
  it('keeps domain services owned by WorkersDomainModule', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, SocialIntegrationsModule) ??
        [],
    ).toEqual([]);
  });
});
