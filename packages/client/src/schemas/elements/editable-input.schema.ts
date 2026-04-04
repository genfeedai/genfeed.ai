import { z } from 'zod';

interface EditableInputOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  type?: 'text' | 'email' | 'url' | 'number';
  customValidation?: (val: string) => string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/;

function isValidEmail(val: unknown): boolean {
  if (typeof val !== 'string') {
    return false;
  }
  return !val.trim() || EMAIL_REGEX.test(val);
}

function isValidUrl(val: unknown): boolean {
  if (typeof val !== 'string') {
    return false;
  }
  return !val.trim() || URL_REGEX.test(val);
}

function isNotEmpty(val: unknown): boolean {
  if (typeof val !== 'string') {
    return false;
  }
  return val.trim().length > 0;
}

export function createEditableInputSchema(options: EditableInputOptions) {
  let baseSchema = z.string();

  if (options.minLength && options.minLength > 0) {
    baseSchema = baseSchema.min(
      options.minLength,
      `Minimum length is ${options.minLength} characters`,
    );
  }

  if (options.maxLength && options.maxLength > 0) {
    baseSchema = baseSchema.max(
      options.maxLength,
      `Maximum length is ${options.maxLength} characters`,
    );
  }

  let schema: z.ZodTypeAny = baseSchema;

  if (options.type === 'email') {
    schema = schema.refine(isValidEmail, 'Please enter a valid email address');
  } else if (options.type === 'url') {
    schema = schema.refine(
      isValidUrl,
      'Please enter a valid URL starting with http:// or https://',
    );
  }

  if (options.required) {
    schema = schema.refine(isNotEmpty, 'This field is required');
  }

  if (options.customValidation) {
    const validate = options.customValidation;
    schema = schema.superRefine((val, ctx) => {
      const error = validate(val as string);
      if (error !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
    });
  }

  return z.object({ editValue: schema });
}

export type EditableInputSchema = z.infer<
  ReturnType<typeof createEditableInputSchema>
>;
