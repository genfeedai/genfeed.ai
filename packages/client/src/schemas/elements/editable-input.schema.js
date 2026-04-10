import { z } from 'zod';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/.+/;
function isValidEmail(val) {
  if (typeof val !== 'string') {
    return false;
  }
  return !val.trim() || EMAIL_REGEX.test(val);
}
function isValidUrl(val) {
  if (typeof val !== 'string') {
    return false;
  }
  return !val.trim() || URL_REGEX.test(val);
}
function isNotEmpty(val) {
  if (typeof val !== 'string') {
    return false;
  }
  return val.trim().length > 0;
}
export function createEditableInputSchema(options) {
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
  let schema = baseSchema;
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
      const error = validate(val);
      if (error !== null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
      }
    });
  }
  return z.object({ editValue: schema });
}
//# sourceMappingURL=editable-input.schema.js.map
