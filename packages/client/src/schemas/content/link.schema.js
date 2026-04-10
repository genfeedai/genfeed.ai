import { z } from 'zod';
export const linkSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  category: z.string().min(1, 'Category is required'),
  label: z.string().min(1, 'Label is required'),
  url: z.string().url('Please enter a valid URL'),
});
//# sourceMappingURL=link.schema.js.map
