import { ErrorCode } from '@genfeedai/enums';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import type { AxiosError } from 'axios';

export interface IJsonApiError {
  errors: Array<{
    code: number;
    title: string;
    detail: string;
    source?: { pointer?: string; parameter?: string };
    meta?: Record<string, unknown>;
  }>;
}

export interface IApiError {
  status: number;
  code: string;
  title: string;
  detail: string;
  timestamp?: string;
  meta?: Record<string, unknown>;
  source?: { pointer?: string; parameter?: string };
  requestId?: string;
  validationErrors?: Array<{ field: string; message: string; code?: string }>;
}

export interface IApiErrorResponse {
  message?: string;
  detail?: string;
  error?: string;
  statusCode?: number;
  errors?: Array<{ field: string; message: string }>;
  [key: string]: unknown;
}

export interface IAxiosLikeError {
  response?: { data?: unknown; status?: number };
  message?: string;
  name?: string;
  code?: string;
}

export function isAxiosError(
  error: unknown,
): error is AxiosError<IApiErrorResponse> {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isAxiosError' in error &&
    (error as AxiosError).isAxiosError === true
  );
}

export function getErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    return error.response?.data?.message || error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function getErrorDetail(error: unknown): string | undefined {
  return isAxiosError(error) ? error.response?.data?.detail : undefined;
}

export function hasErrorDetail(error: unknown, searchText: string): boolean {
  const detail = getErrorDetail(error);
  return detail ? detail.includes(searchText) : false;
}

export class ErrorHandler {
  private static notificationsService = NotificationsService.getInstance();

  static isJsonApiError(error: unknown): error is IJsonApiError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'errors' in error &&
      Array.isArray((error as IJsonApiError).errors)
    );
  }

  static isApiError(error: unknown): error is IApiError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'status' in error &&
      'code' in error &&
      'title' in error &&
      'detail' in error
    );
  }

  static convertJsonApiError(jsonApiError: IJsonApiError): IApiError | null {
    if (!jsonApiError.errors?.length) {
      return null;
    }

    const firstError = jsonApiError.errors[0];
    return {
      code: ErrorHandler.mapStatusToErrorCode(firstError.code),
      detail: firstError.detail,
      meta: firstError.meta,
      source: firstError.source,
      status: firstError.code,
      timestamp: new Date().toISOString(),
      title: firstError.title,
    };
  }

  private static mapStatusToErrorCode(status: number): string {
    const statusMap: Record<number, string> = {
      400: ErrorCode.VALIDATION_FAILED,
      401: ErrorCode.UNAUTHORIZED,
      403: ErrorCode.FORBIDDEN,
      404: ErrorCode.NOT_FOUND,
      409: ErrorCode.CONFLICT,
      429: 'RATE_LIMIT_EXCEEDED',
      500: ErrorCode.INTERNAL_ERROR,
      503: ErrorCode.SERVICE_UNAVAILABLE,
    };
    return statusMap[status] ?? 'UNKNOWN_ERROR';
  }

  static extractErrorDetails(error: unknown): {
    message: string;
    code?: string;
    status?: number;
    validationErrors?: Array<{ field: string; message: string }>;
  } {
    const axiosError = error as IAxiosLikeError;
    const responseData = axiosError?.response?.data;

    if (responseData && ErrorHandler.isJsonApiError(responseData)) {
      const apiError = ErrorHandler.convertJsonApiError(responseData);
      if (apiError) {
        return {
          code: apiError.code,
          message: apiError.detail,
          status: apiError.status,
          validationErrors: apiError.validationErrors,
        };
      }
    }

    if (responseData && ErrorHandler.isApiError(responseData)) {
      return {
        code: responseData.code,
        message: responseData.detail,
        status: responseData.status,
        validationErrors: responseData.validationErrors,
      };
    }

    const dataWithMessage = responseData as { message?: string } | undefined;
    if (dataWithMessage?.message) {
      return {
        message: dataWithMessage.message,
        status: axiosError.response?.status,
      };
    }

    if (axiosError?.message) {
      return { message: axiosError.message };
    }

    return { message: 'An unexpected error occurred' };
  }

  private static readonly ERROR_MESSAGES: Record<string, string> = {
    [ErrorCode.UNAUTHORIZED]: 'Session expired. Please sign in again.',
    [ErrorCode.TOKEN_EXPIRED]: 'Session expired. Please sign in again.',
    [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action.',
    [ErrorCode.INSUFFICIENT_PERMISSIONS]:
      'You do not have permission to perform this action.',
    DATABASE_ERROR: 'A database error occurred. Please try again.',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
    [ErrorCode.SERVICE_UNAVAILABLE]:
      'Service temporarily unavailable. Please try again later.',
    [ErrorCode.TIMEOUT]: 'Request timed out. Please try again.',
  };

  private static readonly FALLBACK_ERROR_MESSAGES: Record<string, string> = {
    [ErrorCode.NOT_FOUND]: 'Resource not found.',
    [ErrorCode.VALIDATION_FAILED]: 'Validation failed.',
    [ErrorCode.CONFLICT]: 'Resource already exists.',
    [ErrorCode.ALREADY_EXISTS]: 'Resource already exists.',
    AUTHENTICATION_ERROR: 'Authentication failed.',
    AUTHORIZATION_ERROR: 'You are not authorized to perform this action.',
    RESOURCE_CONFLICT: 'Resource conflict detected.',
  };

  static handle(error: unknown, context?: string): void {
    const details = ErrorHandler.extractErrorDetails(error);
    const code = details.code ?? '';

    logger.error(`${context || 'Error'}:`, {
      code,
      message: details.message,
      originalError: error,
      status: details.status,
      validationErrors: details.validationErrors,
    });

    if (
      code === ErrorCode.VALIDATION_FAILED &&
      details.validationErrors?.length
    ) {
      const errorMessages = details.validationErrors
        .map((err) => `${err.field}: ${err.message}`)
        .join(', ');
      ErrorHandler.notificationsService.error(
        `Validation failed: ${errorMessages}`,
      );
      return;
    }

    const fixedMessage = ErrorHandler.ERROR_MESSAGES[code];
    if (fixedMessage) {
      ErrorHandler.notificationsService.error(fixedMessage);
      return;
    }

    const fallbackMessage = ErrorHandler.FALLBACK_ERROR_MESSAGES[code];
    if (fallbackMessage) {
      ErrorHandler.notificationsService.error(
        details.message || fallbackMessage,
      );
      return;
    }

    ErrorHandler.notificationsService.error(
      details.message || 'An error occurred. Please try again.',
    );
  }

  static handleSilently(error: unknown, context?: string): void {
    const details = ErrorHandler.extractErrorDetails(error);
    logger.error(`${context || 'Error'} (silent):`, {
      code: details.code,
      message: details.message,
      originalError: error,
      status: details.status,
      validationErrors: details.validationErrors,
    });
  }

  static isAbortError(error: unknown): boolean {
    const err = error as IAxiosLikeError;
    return err?.name === 'AbortError' || err?.code === 'ECONNABORTED';
  }

  private static readonly USER_MESSAGES: Record<string, string> = {
    [ErrorCode.UNAUTHORIZED]: 'Please sign in to continue.',
    [ErrorCode.FORBIDDEN]:
      'You do not have permission to access this resource.',
    [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable.',
  };

  static getUserMessage(error: unknown): string {
    const details = ErrorHandler.extractErrorDetails(error);
    const code = details.code ?? '';
    return (
      ErrorHandler.USER_MESSAGES[code] ||
      details.message ||
      'An unexpected error occurred.'
    );
  }
}
