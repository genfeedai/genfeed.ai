import { AssetScope } from '@genfeedai/enums';
import { z } from 'zod';
export declare const brandSchema: z.ZodObject<
  {
    backgroundColor: z.ZodOptional<z.ZodString>;
    defaultImageModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultImageToVideoModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultMusicModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultVideoModel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodString>;
    fontFamily: z.ZodOptional<z.ZodString>;
    instagramHandle: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    isDarkroomEnabled: z.ZodOptional<z.ZodBoolean>;
    label: z.ZodString;
    primaryColor: z.ZodOptional<z.ZodString>;
    scope: z.ZodOptional<z.ZodEnum<typeof AssetScope>>;
    secondaryColor: z.ZodOptional<z.ZodString>;
    slug: z.ZodString;
    text: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type BrandSchema = z.infer<typeof brandSchema>;
export declare const brandGenerateSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    prompt: z.ZodString;
  },
  z.core.$strip
>;
export type BrandGenerateSchema = z.infer<typeof brandGenerateSchema>;
//# sourceMappingURL=brand.schema.d.ts.map
