import { z } from 'zod';
export const credentialSchema = z.object({
  description: z.string().optional(),
  label: z.string().optional(),
});
//# sourceMappingURL=credential.schema.js.map
