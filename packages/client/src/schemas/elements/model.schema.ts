import { MODEL_KEYS } from '@genfeedai/constants';
import { ModelCategory, ModelProvider } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { z } from 'zod';

export const modelSchema: z.ZodType<Partial<IModel>> = z.object({
  category: z.nativeEnum(ModelCategory),
  cost: z.number().min(0, 'Cost must be greater than or equal to 0'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  isHighlighted: z.boolean().default(false),
  key: z.enum(Object.values(MODEL_KEYS) as [string, ...string[]]),
  label: z.string().min(1, 'Label is required'),
  provider: z.nativeEnum(ModelProvider),
});

export type ModelSchema = z.infer<typeof modelSchema>;
