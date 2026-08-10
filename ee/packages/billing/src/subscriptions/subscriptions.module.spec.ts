import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { resetLicenseVerificationForTests } from '@genfeedai/config/license-server';
import type { ClassProvider, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function isClassProvider(provider: Provider): provider is ClassProvider {
  return (
    typeof provider === 'object' && provider !== null && 'provide' in provider
  );
}

describe('SubscriptionsModule', () => {
  beforeEach(() => {
    resetLicenseVerificationForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetLicenseVerificationForTests();
    vi.resetModules();
  });

  it('uses the OSS service in an unlicensed production self-host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GENFEED_CLOUD', 'false');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'false');
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.example.com');

    const { SubscriptionsModule } = await import('./subscriptions.module');
    const { SubscriptionsService } = await import(
      './services/subscriptions.service'
    );
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      SubscriptionsModule,
    ) as Provider[];
    const serviceProvider = providers.find(
      (provider) =>
        isClassProvider(provider) && provider.provide === SubscriptionsService,
    );

    expect(serviceProvider).toMatchObject({
      provide: SubscriptionsService,
      useClass: OssSubscriptionsService,
    });
  });
});
