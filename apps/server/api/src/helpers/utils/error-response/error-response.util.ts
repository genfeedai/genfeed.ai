import type { IApiError } from '@api/shared/interfaces/error/error.interface';
import { ErrorCode } from '@genfeedai/enums';
import { HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * Utility class for creating standardized error responses
 */
export class ErrorResponse {
  /**
   * Create a standardized API error response
   */
  static create(params: {
    status: HttpStatus;
    code: ErrorCode;
    title: string;
    detail: string;
    meta?: Record<string, unknown>;
    validationErrors?: Array<{
      field: string;
      message: string;
      code?: string;
    }>;
  }): IApiError {
    return {
      code: params.code,
      detail: params.detail,
      requestId: uuidv4(),
      status: params.status,
      timestamp: new Date().toISOString(),
      title: params.title,
      ...(params.meta && { meta: params.meta }),
      ...(params.validationErrors && {
        validationErrors: params.validationErrors,
      }),
    };
  }

  /**
   * Create and throw a standardized HTTP exception
   */
  static throw(params: {
    status: HttpStatus;
    code: ErrorCode;
    title: string;
    detail: string;
    meta?: Record<string, unknown>;
    validationErrors?: Array<{
      field: string;
      message: string;
      code?: string;
    }>;
  }): never {
    const error = ErrorResponse.create(params);
    throw new HttpException(error, params.status);
  }

  /**
   * Common error responses
   */
  static notFound(resource: string, id: string): never {
    ErrorResponse.throw({
      code: ErrorCode.NOT_FOUND,
      detail: `${resource} with ID '${id}' does not exist or you don't have permission to access it`,
      meta: { id, resource },
      status: HttpStatus.NOT_FOUND,
      title: `${resource} not found`,
    });
  }

  static unauthorized(detail: string = 'Authentication required'): never {
    ErrorResponse.throw({
      code: ErrorCode.UNAUTHORIZED,
      detail,
      status: HttpStatus.UNAUTHORIZED,
      title: 'Unauthorized',
    });
  }

  static forbidden(detail: string = 'Insufficient permissions'): never {
    ErrorResponse.throw({
      code: ErrorCode.FORBIDDEN,
      detail,
      status: HttpStatus.FORBIDDEN,
      title: 'Forbidden',
    });
  }

  static validationFailed(
    errors: Array<{ field: string; message: string; code?: string }>,
  ): never {
    ErrorResponse.throw({
      code: ErrorCode.VALIDATION_FAILED,
      detail: 'One or more fields contain invalid values',
      status: HttpStatus.BAD_REQUEST,
      title: 'Validation failed',
      validationErrors: errors,
    });
  }

  static conflict(resource: string, detail: string): never {
    ErrorResponse.throw({
      code: ErrorCode.CONFLICT,
      detail,
      meta: { resource },
      status: HttpStatus.CONFLICT,
      title: 'Conflict',
    });
  }

  static internalError(detail: string = 'An unexpected error occurred'): never {
    ErrorResponse.throw({
      code: ErrorCode.INTERNAL_ERROR,
      detail,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal server error',
    });
  }

  /**
   * Handle an error caught in a controller catch block.
   * If the error is already an HttpException, re-throw it.
   * Otherwise log the error and throw a generic internal server error.
   */
  static handle(
    error: unknown,
    logger: {
      error: (
        message: string,
        context?: string | Record<string, unknown>,
      ) => void;
    },
    context: string,
  ): never {
    if (error instanceof HttpException) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';
    logger.error(`[${context}] ${message}`, { context, error });

    ErrorResponse.throw({
      code: ErrorCode.INTERNAL_ERROR,
      detail: message,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Internal server error',
    });
  }
}
