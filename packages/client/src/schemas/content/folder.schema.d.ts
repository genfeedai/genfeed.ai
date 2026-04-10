import { z } from 'zod';
export declare const folderSchema: z.ZodObject<
  {
    brand: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
  },
  z.core.$strip
>;
export type FolderSchema = z.infer<typeof folderSchema>;
//# sourceMappingURL=folder.schema.d.ts.map
