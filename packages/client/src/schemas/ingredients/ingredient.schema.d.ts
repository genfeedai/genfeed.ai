import { z } from 'zod';
export declare const ingredientSchema: z.ZodObject<
  {
    category: z.ZodString;
    height: z.ZodNumber;
    label: z.ZodString;
    model: z.ZodString;
    style: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
    text: z.ZodString;
    width: z.ZodNumber;
  },
  z.core.$strip
>;
export type IngredientSchema = z.infer<typeof ingredientSchema>;
export declare const ingredientImageToVideoSchema: z.ZodObject<
  {
    category: z.ZodString;
    model: z.ZodString;
    parent: z.ZodOptional<z.ZodString>;
    style: z.ZodString;
    text: z.ZodString;
    transformations: z.ZodArray<z.ZodString>;
  },
  z.core.$strip
>;
export type IngredientImageToVideoSchema = z.infer<
  typeof ingredientImageToVideoSchema
>;
export declare const ingredientClipSchema: z.ZodObject<
  {
    url: z.ZodString;
  },
  z.core.$strip
>;
export type IngredientClipSchema = z.infer<typeof ingredientClipSchema>;
export declare const ingredientAvatarSchema: z.ZodObject<
  {
    avatar: z.ZodString;
    category: z.ZodString;
    text: z.ZodString;
    voice: z.ZodString;
  },
  z.core.$strip
>;
export type IngredientAvatarSchema = z.infer<typeof ingredientAvatarSchema>;
export declare const ingredientCategorySchema: z.ZodObject<
  {
    brand: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type IngredientCategorySchema = z.infer<typeof ingredientCategorySchema>;
//# sourceMappingURL=ingredient.schema.d.ts.map
