import { HttpException, HttpStatus } from '@nestjs/common';

type ErrorContext = Record<string, unknown>;

export class APIError extends HttpException {
  public readonly errorCode: string;
  public readonly errorContext?: ErrorContext;

  constructor(
    message: string,
    status: number,
    code: string,
    context?: ErrorContext,
  ) {
    super(
      {
        code,
        detail: message,
        status,
        title: 'API Error',
        ...(context && { meta: context }),
        timestamp: new Date().toISOString(),
      },
      status,
    );
    this.name = 'APIError';
    this.errorCode = code;
    this.errorContext = context;
  }
}

export class RateLimitError extends APIError {
  constructor(retryAfter?: number) {
    super(
      'Rate limit exceeded',
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMIT_EXCEEDED',
      { retryAfter },
    );
  }
}

export class DatabaseError extends APIError {
  constructor(operation: string, details?: ErrorContext) {
    super(
      `Database operation failed: ${operation}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
      'DATABASE_ERROR',
      { details, operation },
    );
  }
}

export class AuthenticationError extends APIError {
  constructor(message: string = 'Authentication failed') {
    super(message, HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends APIError {
  constructor(resource: string, action: string) {
    super(
      `Access denied for ${action} on ${resource}`,
      HttpStatus.FORBIDDEN,
      'AUTHORIZATION_ERROR',
      { action, resource },
    );
  }
}

export class ResourceConflictError extends APIError {
  constructor(resource: string, identifier: string) {
    super(
      `Resource conflict: ${resource} with identifier ${identifier} already exists`,
      HttpStatus.CONFLICT,
      'RESOURCE_CONFLICT',
      { identifier, resource },
    );
  }
}
