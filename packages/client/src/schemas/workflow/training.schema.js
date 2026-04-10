import { z } from 'zod';
export const trainingSchema = z.object({
  category: z.enum(['subject', 'style']),
  description: z.string().optional(),
  label: z.string().min(1, 'Model name is required'),
  steps: z.number().min(1000).max(5000),
  trigger: z.string().min(1, 'Trigger word is required'),
});
export const trainingEditSchema = z.object({
  brand: z.string().optional(),
  description: z.string().optional(),
  label: z.string().min(1, 'Model name is required'),
});
//# sourceMappingURL=training.schema.js.map
