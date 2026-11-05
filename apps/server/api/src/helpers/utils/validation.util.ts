const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPPERCASE_LETTER_PATTERN = /[A-Z]/;
const LOWERCASE_LETTER_PATTERN = /[a-z]/;
const DIGIT_PATTERN = /[0-9]/;
const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

export function validateEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return EMAIL_PATTERN.test(value);
}

export function validatePassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 8) return false;
  if (!UPPERCASE_LETTER_PATTERN.test(value)) return false;
  if (!LOWERCASE_LETTER_PATTERN.test(value)) return false;
  if (!DIGIT_PATTERN.test(value)) return false;
  if (!SYMBOL_PATTERN.test(value)) return false;
  return true;
}

export function validateUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateEntityId(value: unknown): boolean {
  return isEntityId(value);
}

import { isEntityId } from '@api/helpers/validation/entity-id.validator';
