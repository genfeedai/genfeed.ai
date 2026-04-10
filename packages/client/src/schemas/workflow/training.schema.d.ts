import { z } from 'zod';
export declare const trainingSchema: z.ZodObject<
  {
    category: z.ZodEnum<{
      style: 'style';
      subject: 'subject';
    }>;
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
    steps: z.ZodNumber;
    trigger: z.ZodString;
  },
  z.core.$strip
>;
export type TrainingSchema = z.infer<typeof trainingSchema>;
export declare const trainingEditSchema: z.ZodObject<
  {
    brand: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodString;
  },
  z.core.$strip
>;
export type TrainingEditSchema = z.infer<typeof trainingEditSchema>;
//# sourceMappingURL=training.schema.d.ts.map
