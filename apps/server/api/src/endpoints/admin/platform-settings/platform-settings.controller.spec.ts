import { PlatformSettingsController } from '@api/endpoints/admin/platform-settings/platform-settings.controller';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = { originalUrl: '/admin/platform-settings' } as Request;

function attributesOf(document: unknown): Record<string, unknown> {
  const data = Reflect.get(document as object, 'data') as {
    attributes: Record<string, unknown>;
  };
  return data.attributes;
}

describe('PlatformSettingsController', () => {
  const row = {
    id: 'platform-settings',
    isEmailVerificationRequired: true,
    key: 'platform',
  };
  let platformSettingsService: {
    getSingleton: ReturnType<typeof vi.fn>;
    updateSingleton: ReturnType<typeof vi.fn>;
  };
  let notificationsService: {
    isEmailDeliveryConfigured: ReturnType<typeof vi.fn>;
  };
  let controller: PlatformSettingsController;

  beforeEach(() => {
    platformSettingsService = {
      getSingleton: vi.fn().mockResolvedValue(row),
      updateSingleton: vi.fn().mockResolvedValue(row),
    };
    notificationsService = { isEmailDeliveryConfigured: vi.fn() };
    controller = new PlatformSettingsController(
      platformSettingsService as never,
      { error: vi.fn() } as never,
      notificationsService as never,
    );
  });

  it('marks email delivery as configured when the notifications service has a mailer', async () => {
    notificationsService.isEmailDeliveryConfigured.mockResolvedValue(true);

    const attributes = attributesOf(await controller.get(request));

    expect(attributes.isEmailDeliveryConfigured).toBe(true);
    expect(attributes.isEmailVerificationRequired).toBe(true);
  });

  it('marks email delivery as unavailable without a mailer, keeping the stored switch', async () => {
    notificationsService.isEmailDeliveryConfigured.mockResolvedValue(false);

    const attributes = attributesOf(await controller.get(request));

    expect(attributes.isEmailDeliveryConfigured).toBe(false);
    expect(attributes.isEmailVerificationRequired).toBe(true);
  });

  it('reports the same fact after an update', async () => {
    notificationsService.isEmailDeliveryConfigured.mockResolvedValue(false);

    const attributes = attributesOf(
      await controller.update(request, { isEmailVerificationRequired: true }),
    );

    expect(attributes.isEmailDeliveryConfigured).toBe(false);
  });
});
