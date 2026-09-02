import { ReplyBotPlatform } from '@genfeedai/contracts';
import { z } from 'zod';

export const monitoredAccountSchema = z.object({
  avatarUrl: z.string().url().optional().or(z.literal('')),
  bio: z.string().optional(),
  displayName: z.string().optional(),
  followersCount: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
  platform: z.nativeEnum(ReplyBotPlatform),
  externalId: z.string().min(1, 'User ID is required'),
  username: z.string().min(1, 'Username is required'),
});

export type MonitoredAccountSchema = z.infer<typeof monitoredAccountSchema>;
