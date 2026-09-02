import { Platform } from '@genfeedai/contracts';
import { z } from 'zod';

export const watchlistSchema = z.object({
  brandId: z.string().min(1, 'Brand is required'),
  category: z.string().optional(),
  handle: z.string().min(1, 'Handle is required'),
  label: z.string().min(1, 'Name is required'),
  notes: z.string().optional(),
  platform: z.enum(
    [Platform.INSTAGRAM, Platform.TIKTOK, Platform.YOUTUBE, Platform.TWITTER],
    {
      message: 'Platform is required',
    },
  ),
});

export type WatchlistSchema = z.infer<typeof watchlistSchema>;
