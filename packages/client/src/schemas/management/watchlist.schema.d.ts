import { Platform } from '@genfeedai/enums';
import { z } from 'zod';
export declare const watchlistSchema: z.ZodObject<
  {
    brand: z.ZodString;
    category: z.ZodOptional<z.ZodString>;
    handle: z.ZodString;
    name: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
    platform: z.ZodEnum<{
      youtube: Platform.YOUTUBE;
      instagram: Platform.INSTAGRAM;
      tiktok: Platform.TIKTOK;
      twitter: Platform.TWITTER;
    }>;
  },
  z.core.$strip
>;
export type WatchlistSchema = z.infer<typeof watchlistSchema>;
//# sourceMappingURL=watchlist.schema.d.ts.map
