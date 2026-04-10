import { TagCategory } from '@genfeedai/enums';
import { z } from 'zod';
export const tagSchema = z.object({
  backgroundColor: z.string().optional(),
  category: z
    .union([z.enum(Object.values(TagCategory)), z.literal('')])
    .optional(),
  description: z.string().optional(),
  key: z
    .string()
    .regex(/^[a-z0-9-]*$/, 'Key must be lowercase alphanumeric with hyphens')
    .optional(),
  label: z.string().min(1, 'Label is required'),
  textColor: z.string().optional(),
});
//# sourceMappingURL=tag.schema.js.map
