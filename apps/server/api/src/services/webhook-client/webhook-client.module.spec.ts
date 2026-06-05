import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/collections/organization-settings/organization-settings.module',
  () => ({
    OrganizationSettingsModule: class OrganizationSettingsModule {},
  }),
);

import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { WebhookClientService } from '@api/services/webhook-client/webhook-client.service';

describe('WebhookClientModule', () => {
  it('does not register the webhook processor provider in the API module', () => {
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
