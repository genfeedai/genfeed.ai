import { z } from 'zod';
export declare const workflowSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    key: z.ZodString;
    label: z.ZodString;
    status: z.ZodOptional<
      z.ZodEnum<{
        active: 'active';
        inactive: 'inactive';
        draft: 'draft';
      }>
    >;
    tasks: z.ZodArray<z.ZodString>;
    trigger: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type WorkflowSchema = z.infer<typeof workflowSchema>;
//# sourceMappingURL=workflow.schema.d.ts.map
