import { z } from 'zod';
export const organizationSchema = z.object({
  label: z.string().min(1, 'Label is required'),
});
//# sourceMappingURL=organization.schema.js.map
