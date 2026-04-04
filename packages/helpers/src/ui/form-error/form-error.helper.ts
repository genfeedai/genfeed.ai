import type { FieldError, FieldErrors } from 'react-hook-form';

type ErrorValue = FieldError | Record<string, unknown> | undefined;

export function parseFormErrors(errors: FieldErrors): string[] {
  const errorMessages: string[] = [];

  function processError(fieldName: string, error: ErrorValue): void {
    if (!error) {
      return;
    }

    if ('message' in error && typeof error.message === 'string') {
      errorMessages.push(`${fieldName}: ${error.message}`);
      return;
    }

    for (const [nestedKey, nestedError] of Object.entries(error)) {
      processError(`${fieldName}.${nestedKey}`, nestedError as ErrorValue);
    }
  }

  for (const [fieldName, error] of Object.entries(errors)) {
    processError(fieldName, error);
  }

  return errorMessages;
}

export function hasFormErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
