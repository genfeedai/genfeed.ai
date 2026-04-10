import { z } from 'zod';
export const integrationSchema = z.object({
  elevenlabs: z.string().optional(),
  klingai: z.string().optional(),
  leonardo: z.string().optional(),
});
//# sourceMappingURL=integration.schema.js.map
