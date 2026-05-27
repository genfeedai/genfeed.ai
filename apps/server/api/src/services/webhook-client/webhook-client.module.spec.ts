import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/organization-settings/organization-settings.module',
  () => ({
    OrganizationSettingsModule: class OrganizationSettingsModule {},
  }),
);

describe('WebhookClientModule', () => {
  it('does not register the webhook processor provider in the API module', async () => {
    const { WebhookClientModule } = await import(
      '@api/services/webhook-client/webhook-client.module'
    );
    const { WebhookClientService } = await import(
      '@api/services/webhook-client/webhook-client.service'
    );
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WebhookClientModule) ?? [];

    expect(providers).toContain(WebhookClientService);
    expect(
      providers.some(
        (provider: unknown) =>
          typeof provider === 'function' &&
          provider.name === 'WebhookClientProcessor',
      ),
    ).toBe(false);
  });
});
