import { z } from 'zod';

export const folderSchema = z.object({
  brandId: z.string().optional(),
  description: z.string().optional(),
  label: z.string().min(1, 'Label is required'),
  tags: z.array(z.string()),
});

export type FolderSchema = z.infer<typeof folderSchema>;
