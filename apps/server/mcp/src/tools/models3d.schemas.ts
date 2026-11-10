import { z } from 'zod';

const MODEL3D_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;

export const models3dToolSchemas = {
  render_3d: z
    .object({
      build: z.boolean().optional(),
      imageUrl: z.string().url().max(2048),
      prompt: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
  get_model3d: z
    .object({ id: z.string().min(1).max(255).regex(MODEL3D_ID_PATTERN) })
    .strict(),
};
type Models3dToolName = keyof typeof models3dToolSchemas;
export type Models3dToolInput<Name extends Models3dToolName> = z.infer<
  (typeof models3dToolSchemas)[Name]
>;
