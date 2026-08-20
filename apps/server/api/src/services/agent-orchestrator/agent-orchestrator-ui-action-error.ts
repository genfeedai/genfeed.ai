import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';

const PROVIDER_AUTHENTICATION_DETAIL =
  'The model provider rejected the credentials for this request.';

function inferAuthFailureStatus(
  error: string | undefined,
): HttpStatus.UNAUTHORIZED | HttpStatus.FORBIDDEN | null {
  if (!error) {
    return null;
  }

  if (
    /status code 401\b|\bHTTP\s*401\b|\bunauthorized\b|\bunauthenticated\b|invalid(?:\s+\w+)?\s+token|authentication (?:failed|required)|rejected the credentials|(?:failed with status|generation failed:)\s*401\b|:\s*401\s*$/i.test(
      error,
    )
  ) {
    return HttpStatus.UNAUTHORIZED;
  }

  if (
    /status code 403\b|\bHTTP\s*403\b|\bforbidden\b|insufficient permissions|(?:failed with status|generation failed:)\s*403\b|:\s*403\s*$/i.test(
      error,
    )
  ) {
    return HttpStatus.FORBIDDEN;
  }

  return null;
}

function readForbiddenDetail(error: string | undefined): string {
  const trimmed = error?.trim() ?? '';
  if (!trimmed) {
    return 'Insufficient permissions';
  }

  const withoutStatus = trimmed
    .replace(/^Request failed with status code 403:?\s*/i, '')
    .replace(/^Failed to respond to UI action:\s*403\s*-\s*/i, '')
    .trim();

  return !withoutStatus ||
    /^Request failed with status code 403$/i.test(trimmed)
    ? 'Insufficient permissions'
    : withoutStatus;
}

/**
 * Confirmed UI actions used to wrap every tool failure as 500, including
 * swallowed upstream 401/403s. Auth failures stay on the existing
 * ErrorResponse 401/403 path; unexpected failures remain 500.
 */
export function throwFailedUiActionResult(
  error: string | undefined,
  fallback: string,
): never {
  const status = inferAuthFailureStatus(error);
  if (status === HttpStatus.UNAUTHORIZED) {
    // Tool failures that reach this path already passed session guards.
    ErrorResponse.unauthorized(PROVIDER_AUTHENTICATION_DETAIL);
  }
  if (status === HttpStatus.FORBIDDEN) {
    ErrorResponse.forbidden(readForbiddenDetail(error));
  }
  if (/Cancelled by user/i.test(error ?? '')) {
    ErrorResponse.conflict('generation', 'Cancelled by user');
  }
  throw new InternalServerErrorException(error?.trim() || fallback);
}

export function rethrowUiActionError(error: unknown): never {
  if (error instanceof HttpException) {
    if (error.getStatus() !== HttpStatus.INTERNAL_SERVER_ERROR) {
      throw error;
    }
    const message = readHttpExceptionMessage(error);
    if (message && inferAuthFailureStatus(message)) {
      throwFailedUiActionResult(message, message);
    }
    throw error;
  }

  const status = readUpstreamHttpStatus(error);
  if (status === HttpStatus.UNAUTHORIZED) {
    ErrorResponse.unauthorized(PROVIDER_AUTHENTICATION_DETAIL);
  }
  if (status === HttpStatus.FORBIDDEN) {
    ErrorResponse.forbidden(
      readForbiddenDetail(error instanceof Error ? error.message : undefined),
    );
  }

  const message = error instanceof Error ? error.message : undefined;
  if (inferAuthFailureStatus(message)) {
    throwFailedUiActionResult(message, 'Thread UI action failed.');
  }
  throw error;
}

function readHttpExceptionMessage(error: HttpException): string | undefined {
  const response = error.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  if (typeof response === 'object' && response !== null) {
    if (
      'detail' in response &&
      typeof response.detail === 'string' &&
      response.detail.trim()
    ) {
      return response.detail;
    }
    if (
      'message' in response &&
      typeof response.message === 'string' &&
      response.message.trim()
    ) {
      return response.message;
    }
  }
  return error.message;
}

function readUpstreamHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  if (
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }
  return 'status' in error && typeof error.status === 'number'
    ? error.status
    : null;
}
