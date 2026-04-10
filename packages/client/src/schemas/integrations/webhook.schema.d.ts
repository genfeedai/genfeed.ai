import { z } from 'zod';
export declare const webhookSettingsSchema: z.ZodObject<
  {
    isWebhookEnabled: z.ZodBoolean;
    webhookEndpoint: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type WebhookSettingsSchema = z.infer<typeof webhookSettingsSchema>;
//# sourceMappingURL=webhook.schema.d.ts.map
