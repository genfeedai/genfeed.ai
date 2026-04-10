import { z } from 'zod';
export declare const tagSchema: z.ZodObject<
  {
    backgroundColor: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<
      z.ZodUnion<
        readonly [
          z.ZodEnum<{
            [x: string]: string;
          }>,
          z.ZodLiteral<''>,
        ]
      >
    >;
    description: z.ZodOptional<z.ZodString>;
    key: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    textColor: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type TagSchema = z.infer<typeof tagSchema>;
//# sourceMappingURL=tag.schema.d.ts.map
