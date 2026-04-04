import { z } from 'zod';

export const ingredientSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  height: z.number().min(1, 'Height is required'),
  label: z.string().min(1, 'Label is required'),
  model: z.string().min(1, 'Model is required'),
  style: z.string().min(1, 'Style is required'),
  tags: z.array(z.string()).optional(),
  text: z.string().min(1, 'Prompt is required'),
  width: z.number().min(1, 'Width is required'),
});

export type IngredientSchema = z.infer<typeof ingredientSchema>;

export const ingredientImageToVideoSchema = z.object({
  category: z.string().min(1, 'Type is required'),
  model: z.string().min(1, 'Model is required'),
  parent: z.string().optional(),
  style: z.string().min(1, 'Style is required'),
  text: z.string().min(1, 'Prompt is required'),
  transformations: z.array(z.string()).min(1, 'Transformations are required'),
});

export type IngredientImageToVideoSchema = z.infer<
  typeof ingredientImageToVideoSchema
>;

export const ingredientClipSchema = z.object({
  url: z.string().url('URL is required'),
});

export type IngredientClipSchema = z.infer<typeof ingredientClipSchema>;

export const ingredientAvatarSchema = z.object({
  avatar: z.string().min(1, 'Avatar is required'),
  category: z.string().min(1, 'Category is required'),
  text: z.string().min(1, 'Text is required'),
  voice: z.string().min(1, 'Voice is required'),
});

export type IngredientAvatarSchema = z.infer<typeof ingredientAvatarSchema>;

export const ingredientCategorySchema = z.object({
  brand: z.string().optional(),
  status: z.string().optional(),
});

export type IngredientCategorySchema = z.infer<typeof ingredientCategorySchema>;
