import { MODULE_METADATA } from '@nestjs/common/constants';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

describe('SocialIntegrationsModule', () => {
  it('only exports services it provides', () => {
    const exported =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, SocialIntegrationsModule) ??
      [];
    const providers =
      Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        SocialIntegrationsModule,
      ) ?? [];

    expect(exported).not.toEqual([]);
    expect(
      exported.every((service: unknown) => providers.includes(service)),
    ).toBe(true);
  });
});
