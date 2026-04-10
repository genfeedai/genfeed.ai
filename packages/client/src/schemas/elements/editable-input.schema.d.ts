import { z } from 'zod';
interface EditableInputOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  type?: 'text' | 'email' | 'url' | 'number';
  customValidation?: (val: string) => string | null;
}
export declare function createEditableInputSchema(
  options: EditableInputOptions,
): z.ZodObject<
  {
    editValue: z.ZodType<
      unknown,
      unknown,
      z.core.$ZodTypeInternals<unknown, unknown>
    >;
  },
  z.core.$strip
>;
export type EditableInputSchema = z.infer<
  ReturnType<typeof createEditableInputSchema>
>;
//# sourceMappingURL=editable-input.schema.d.ts.map
