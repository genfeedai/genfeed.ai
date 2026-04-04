import { z } from 'zod';

export const workflowSchema = z.object({
  description: z.string().optional(),
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(/^[a-z0-9-]+$/, 'Key must be lowercase alphanumeric with dashes'),
  label: z.string().min(1, 'Label is required'),
  status: z.enum(['active', 'inactive', 'draft']).optional(),
  tasks: z.array(z.string()).min(1, 'At least one task is required'),
  trigger: z.string().optional(),
});

export type WorkflowSchema = z.infer<typeof workflowSchema>;
