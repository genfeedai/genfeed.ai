import { z } from 'zod';

export const subscriptionSchema = z.object({
  amount: z.number().min(1, 'Amount is required'),
});

export type SubscriptionSchema = z.infer<typeof subscriptionSchema>;
