import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/organization-settings/organization-settings.module',
  () => ({
    OrganizationSettingsModule: class OrganizationSettingsModule {},
  }),
);

describe('WebhookClientModule', () => {
  it('registers the webhook processor provider', async () => {
    const { WebhookClientModule } = await import(
      '@api/services/webhook-client/webhook-client.module'
    );
    const { WebhookClientProcessor } = await import(
      '@api/services/webhook-client/webhook-client.processor'
    );
    const providers =
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, WebhookClientModule) ?? [];

    expect(providers).toContain(WebhookClientProcessor);
  });
});
