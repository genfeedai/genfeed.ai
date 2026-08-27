import { CredentialPlatform } from '@genfeedai/enums';
import { HttpException, HttpStatus } from '@nestjs/common';

type ExternalError = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

const normalizeOriginalError = (
  originalError?: unknown,
): { originalError: string; statusCode: number | undefined } | undefined => {
  if (originalError == null) {
    return undefined;
  }

  // Handle primitive types
  if (typeof originalError !== 'object') {
    const primitiveValue =
      typeof originalError === 'string' ||
      typeof originalError === 'number' ||
      typeof originalError === 'boolean' ||
      typeof originalError === 'bigint'
        ? String(originalError)
        : 'Unknown error type';

    return {
      originalError: primitiveValue,
      statusCode: undefined,
    };
  }

  const errorObject = originalError as ExternalError;
  const normalizedMessage =
    typeof errorObject.message === 'string'
      ? errorObject.message
      : JSON.stringify(originalError);

  const statusCode = errorObject.status ?? errorObject.statusCode;
  const numericStatus = typeof statusCode === 'number' ? statusCode : undefined;

  if (!normalizedMessage && numericStatus === undefined) {
    return undefined;
  }

  // Always include statusCode property (even as undefined) for test equality
  return {
    originalError: normalizedMessage,
    statusCode: numericStatus,
  };
};

export class ExternalServiceException extends HttpException {
  constructor(
    public readonly service: string,
    message: string,
    originalError?: unknown,
    public readonly errorCode: string = 'EXTERNAL_SERVICE_ERROR',
  ) {
    const normalizedError = normalizeOriginalError(originalError);

    super(
      {
        code: errorCode,
        detail: `${service}: ${message}`,
        service,
        status: HttpStatus.BAD_GATEWAY,
        timestamp: new Date().toISOString(),
        title: 'External Service Error',
        ...(normalizedError && { meta: normalizedError }),
      },
      HttpStatus.BAD_GATEWAY,
    );
    this.name = 'ExternalServiceException';
  }
}

export class AIServiceException extends ExternalServiceException {
  constructor(service: string, operation: string, originalError?: unknown) {
    super(
      service,
      `AI operation failed: ${operation}`,
      originalError,
      'AI_SERVICE_ERROR',
    );
  }
}

export class PaymentServiceException extends ExternalServiceException {
  constructor(provider: string, operation: string, originalError?: unknown) {
    super(
      provider,
      `Payment operation failed: ${operation}`,
      originalError,
      'PAYMENT_SERVICE_ERROR',
    );
  }
}

export class StorageServiceException extends ExternalServiceException {
  constructor(operation: string, originalError?: unknown) {
    super(
      'AWS S3',
      `Storage operation failed: ${operation}`,
      originalError,
      'STORAGE_SERVICE_ERROR',
    );
  }
}

export class SocialMediaException extends ExternalServiceException {
  constructor(
    platform: CredentialPlatform,
    operation: string,
    originalError?: unknown,
  ) {
    super(
      platform,
      `Social media operation failed: ${operation}`,
      originalError,
      'SOCIAL_MEDIA_ERROR',
    );
  }
}
