import { ValidationException } from '@api/exceptions/validation.exception';

function isPersonaHandleUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as {
    code?: unknown;
    meta?: { target?: unknown; constraint?: unknown };
  };
  if (record.code !== 'P2002') {
    return false;
  }
  const target = record.meta?.target;
  const constraint = record.meta?.constraint;
  const haystack = [
    ...(Array.isArray(target) ? target.map(String) : [String(target ?? '')]),
    String(constraint ?? ''),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes('handle') || haystack.includes('org_brand_handle');
}

export function rethrowHandleConflict(
  error: unknown,
  handle?: string | null,
): never {
  if (isPersonaHandleUniqueViolation(error)) {
    throw new ValidationException(
      'A character with this handle already exists in this brand',
      'handle',
      handle,
    );
  }
  throw error;
}
