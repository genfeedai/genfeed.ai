import { z } from 'zod';
export const musicSchema = z.object({
  duration: z
    .number()
    .min(5, 'Duration must be at least 5 seconds')
    .max(30, 'Duration cannot exceed 30 seconds'),
  prompt: z.string().min(1, 'Music description is required'),
});
//# sourceMappingURL=music.schema.js.map
