import { z } from 'zod';
export declare const organizationSchema: z.ZodObject<
  {
    label: z.ZodString;
  },
  z.core.$strip
>;
export type OrganizationSchema = z.infer<typeof organizationSchema>;
//# sourceMappingURL=organization.schema.d.ts.map
