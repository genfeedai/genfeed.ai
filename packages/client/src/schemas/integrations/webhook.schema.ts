import { z } from 'zod';

function isValidHttpUrl(url: string): boolean {
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

export type WebhookSettingsSchema = z.infer<typeof webhookSettingsSchema>;
