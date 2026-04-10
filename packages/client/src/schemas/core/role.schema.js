import { z } from 'zod';
export const roleSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  label: z.string().min(1, 'Label is required'),
  primaryColor: z.string().optional(),
});
//# sourceMappingURL=role.schema.js.map
