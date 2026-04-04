import { Platform } from '@genfeedai/enums';
import { z } from 'zod';

export const watchlistSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  category: z.string().optional(),
  handle: z.string().min(1, 'Handle is required'),
  name: z.string().min(1, 'Name is required'),
  notes: z.string().optional(),
  platform: z.enum(
    [Platform.INSTAGRAM, Platform.TIKTOK, Platform.YOUTUBE, Platform.TWITTER],
    {
      message: 'Platform is required',
    },
  ),
});

export type WatchlistSchema = z.infer<typeof watchlistSchema>;
