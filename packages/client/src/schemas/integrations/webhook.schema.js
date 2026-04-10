import { z } from 'zod';

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
export const webhookSettingsSchema = z
  .object({
    isWebhookEnabled: z.boolean(),
    webhookEndpoint: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.isWebhookEnabled) {
        return true;
      }
      if (!data.webhookEndpoint?.trim()) {
        return false;
      }
      return isValidHttpUrl(data.webhookEndpoint);
    },
    {
      message: 'Please enter a valid webhook endpoint URL',
      path: ['webhookEndpoint'],
    },
  );
//# sourceMappingURL=webhook.schema.js.map
