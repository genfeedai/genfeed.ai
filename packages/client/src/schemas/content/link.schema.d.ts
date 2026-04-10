import { z } from 'zod';
export declare const linkSchema: z.ZodObject<
  {
    brand: z.ZodString;
    category: z.ZodString;
    label: z.ZodString;
    url: z.ZodString;
  },
  z.core.$strip
>;
export type LinkSchema = z.infer<typeof linkSchema>;
//# sourceMappingURL=link.schema.d.ts.map
