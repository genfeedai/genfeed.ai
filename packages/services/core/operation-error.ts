import type { IStructuredError } from '@genfeedai/interfaces/utils/error.interface';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';

export const SERVICE_OPERATION_ERROR_NAME = 'ServiceOperationError';

const PRIVATE_ERROR_KEYS = new Set([
  'body',
  'config',
  'data',
  'debugInfo',
  'errors',
  'headers',
  'meta',
  'originalError',
  'request',
  'response',
]);

const UNSAFE_DIAGNOSTIC_PATTERN =
  /[^\s@]+@[^\s@]+\.[^\s@]+|Bearer\s+\S+|sk[-_]|eyJ[A-Za-z0-9_-]{20,}/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCancelledRequest(error: unknown): boolean {
  return isRecord(error) && error.isCancelled === true;
}

export function isServiceOperationError(
  error: unknown,
): error is Error & IStructuredError {
  return error instanceof Error && error.name === SERVICE_OPERATION_ERROR_NAME;
}

export function isSafeDiagnosticText(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length < 200 &&
    !trimmed.includes('\n') &&
    !UNSAFE_DIAGNOSTIC_PATTERN.test(trimmed)
  );
}

function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return isSafeDiagnosticText(trimmed) ? trimmed : undefined;
}

function readFlag(error: unknown, key: string): boolean {
  return isRecord(error) && error[key] === true;
}

function readStatus(error: unknown, memberStatus?: number): number {
  if (typeof memberStatus === 'number' && Number.isFinite(memberStatus)) {
    return memberStatus;
  }

  if (!isRecord(error)) {
    return 500;
  }

  if (typeof error.status === 'number' && Number.isFinite(error.status)) {
    return error.status;
  }

  const response = error.response;
  if (
    isRecord(response) &&
    typeof response.status === 'number' &&
    Number.isFinite(response.status)
  ) {
    return response.status;
  }

  return 500;
}

function readMessage(error: unknown): string | undefined {
  if (error instanceof Error) {
    return sanitizeDiagnosticText(error.message);
  }

  if (isRecord(error)) {
    return sanitizeDiagnosticText(error.message);
  }

  return undefined;
}

function readValidationErrors(
  error: unknown,
): Record<string, string[]> | undefined {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }

  const data = error.response.data;
  if (!isRecord(data) || !Array.isArray(data.errors)) {
    return undefined;
  }

  const acc: Record<string, string[]> = {};
  for (const item of data.errors) {
    if (!isRecord(item)) {
      continue;
    }

    const field =
      sanitizeDiagnosticText(item.field) ??
      sanitizeDiagnosticText(item.property);
    if (!field) {
      continue;
    }

    const messagesToAdd: string[] = [];
    const message = sanitizeDiagnosticText(item.message);
    if (message) {
      messagesToAdd.push(message);
    }
    if (isRecord(item.constraints)) {
      for (const constraintMessage of Object.values(item.constraints)) {
        const sanitized = sanitizeDiagnosticText(constraintMessage);
        if (sanitized) {
          messagesToAdd.push(sanitized);
        }
      }
    }
    if (messagesToAdd.length === 0) {
      continue;
    }

    const messages = acc[field] ?? [];
    messages.push(...messagesToAdd);
    acc[field] = messages;
  }

  return Object.keys(acc).length > 0 ? acc : undefined;
}

/**
 * Convert interceptor / service rejections into a real Error with operation
 * context. Plain `{ errors }` objects otherwise surface in Sentry as a
 * Non-Error unhandledrejection and a second generic wrapper.
 */
export function normalizeOperationError(
  operation: string,
  error: unknown,
): Error & IStructuredError {
  if (isServiceOperationError(error)) {
    if (!error.metadata || typeof error.metadata.operation !== 'string') {
      error.metadata = { ...error.metadata, operation };
    }
    return error;
  }

  const member = getJsonApiErrorMember(error);
  const status = readStatus(error, member?.status);
  const category =
    sanitizeDiagnosticText(member?.title) ??
    sanitizeDiagnosticText(member?.code) ??
    'service_operation';
  const message =
    sanitizeDiagnosticText(member?.detail) ??
    sanitizeDiagnosticText(member?.title) ??
    readMessage(error) ??
    'Service operation failed';
  const validationErrors = readValidationErrors(error);

  const structuredError = new Error(message) as Error & IStructuredError;
  structuredError.name = SERVICE_OPERATION_ERROR_NAME;
  structuredError.category = category;
  structuredError.code = sanitizeDiagnosticText(member?.code);
  structuredError.isAuthError = readFlag(error, 'isAuthError');
  structuredError.isCancelled = readFlag(error, 'isCancelled');
  structuredError.isNetworkError = readFlag(error, 'isNetworkError');
  structuredError.isTimeout = readFlag(error, 'isTimeout');
  structuredError.metadata = { operation };
  structuredError.status = status;
  if (validationErrors) {
    structuredError.validationErrors = validationErrors;
  }

  for (const key of PRIVATE_ERROR_KEYS) {
    if (key in structuredError) {
      delete (structuredError as unknown as Record<string, unknown>)[key];
    }
  }

  return structuredError;
}
