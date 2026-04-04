import { HttpException, HttpStatus } from '@nestjs/common';

type BusinessErrorDetails = Record<string, unknown>;

export class BusinessLogicException extends HttpException {
  constructor(
    message: string,
    details?: BusinessErrorDetails,
    public readonly errorCode: string = 'BUSINESS_LOGIC_ERROR',
  ) {
    super(
      {
        code: errorCode,
        detail: message,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        timestamp: new Date().toISOString(),
        title: 'Business Logic Error',
        ...(details && { meta: details }),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'BusinessLogicException';
  }
}

export class InsufficientCreditsException extends BusinessLogicException {
  constructor(required: number, available: number) {
    super(
      `Insufficient credits: ${required} required, ${available} available`,
      { available, required },
      'INSUFFICIENT_CREDITS',
    );
  }
}

export class InvalidOperationException extends BusinessLogicException {
  constructor(operation: string, reason: string) {
    super(
      `Invalid operation: ${operation} - ${reason}`,
      { operation, reason },
      'INVALID_OPERATION',
    );
  }
}

export class ResourceNotReadyException extends BusinessLogicException {
  constructor(resource: string, currentState: string, requiredState: string) {
    super(
      `Resource ${resource} is not ready: current state is ${currentState}, required state is ${requiredState}`,
      { currentState, requiredState, resource },
      'RESOURCE_NOT_READY',
    );
  }
}
