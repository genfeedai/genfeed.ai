import { z } from 'zod';
export declare const roleSchema: z.ZodObject<
  {
    key: z.ZodString;
    label: z.ZodString;
    primaryColor: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type RoleSchema = z.infer<typeof roleSchema>;
//# sourceMappingURL=role.schema.d.ts.map
