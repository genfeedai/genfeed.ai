import { z } from 'zod';
export declare const musicSchema: z.ZodObject<
  {
    duration: z.ZodNumber;
    prompt: z.ZodString;
  },
  z.core.$strip
>;
export type MusicSchema = z.infer<typeof musicSchema>;
//# sourceMappingURL=music.schema.d.ts.map
