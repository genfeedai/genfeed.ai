import { ReplyBotPlatform } from '@genfeedai/enums';
import { z } from 'zod';
export declare const monitoredAccountSchema: z.ZodObject<
  {
    avatarUrl: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<''>]>;
    bio: z.ZodOptional<z.ZodString>;
    displayName: z.ZodOptional<z.ZodString>;
    followersCount: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    platform: z.ZodEnum<typeof ReplyBotPlatform>;
    platformUserId: z.ZodString;
    username: z.ZodString;
  },
  z.core.$strip
>;
export type MonitoredAccountSchema = z.infer<typeof monitoredAccountSchema>;
//# sourceMappingURL=monitored-account.schema.d.ts.map
