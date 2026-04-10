import { z } from 'zod';
export declare const subscriptionSchema: z.ZodObject<
  {
    amount: z.ZodNumber;
  },
  z.core.$strip
>;
export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;
//# sourceMappingURL=subscription.schema.d.ts.map
