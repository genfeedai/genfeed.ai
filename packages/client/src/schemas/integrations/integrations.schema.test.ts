import { integrationSchema } from '@genfeedai/client/schemas/integrations/integration.schema';
import { webhookSettingsSchema } from '@genfeedai/client/schemas/integrations/webhook.schema';
import { describe, expect, it } from 'vitest';

describe('integration schemas', () => {
  describe('integrationSchema', () => {
    it('accepts empty object', () => {
      expect(integrationSchema.safeParse({}).success).toBe(true);
    });

    it('accepts optional keys', () => {
      expect(
        integrationSchema.safeParse({ elevenlabs: 'k1', klingai: 'k2' })
          .success,
      ).toBe(true);
    });
  });

  describe('webhookSettingsSchema', () => {
    it('accepts disabled webhook', () => {
      expect(
        webhookSettingsSchema.safeParse({ isWebhookEnabled: false }).success,
      ).toBe(true);
    });

    it('accepts enabled with valid URL', () => {
      expect(
        webhookSettingsSchema.safeParse({
          isWebhookEnabled: true,
          webhookEndpoint: 'https://example.com/wh',
        }).success,
      ).toBe(true);
    });

    it('rejects enabled without URL', () => {
      expect(
        webhookSettingsSchema.safeParse({ isWebhookEnabled: true }).success,
      ).toBe(false);
    });

    it('rejects enabled with invalid URL', () => {
      expect(
        webhookSettingsSchema.safeParse({
          isWebhookEnabled: true,
          webhookEndpoint: 'not-url',
        }).success,
      ).toBe(false);
    });

    it('rejects enabled with empty URL', () => {
      expect(
        webhookSettingsSchema.safeParse({
          isWebhookEnabled: true,
          webhookEndpoint: '',
        }).success,
      ).toBe(false);
    });
  });
});
