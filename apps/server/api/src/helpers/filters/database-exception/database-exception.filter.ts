import { AllExceptionFilter } from '@api/helpers/filters/all-exception/all-exception.filter';
import { type ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request as ExpressRequest } from 'express';

type DatabaseException = {
  code?: unknown;
  message?: unknown;
  meta?: unknown;
  name?: unknown;
};

@Catch()
export class DatabaseExceptionFilter extends AllExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const exceptionObj = exception as DatabaseException;

    if (!this.isPrismaError(exceptionObj)) {
      return super.catch(exception, host);
    }

    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest<ExpressRequest>();

    const { detail, status, title } = this.mapPrismaError(exceptionObj);

    if (this.SENTRY_ENVIRONMENT !== 'development') {
      Sentry.captureException(exception);
    } else {
      this.loggerService.error(
        `${req.method} ${req.originalUrl} ${status} - ${title}: ${detail}`,
        {
          databaseCode: exceptionObj.code,
          operation: 'catch',
          service: 'DatabaseExceptionFilter',
        },
      );
    }

    this.writeJsonApiError(res, {
      detail,
      pointer: req.originalUrl,
      status,
      title,
    });
  }

  private isPrismaError(exception: DatabaseException): boolean {
    return (
      typeof exception.name === 'string' &&
      exception.name.startsWith('PrismaClient')
    );
  }

  private mapPrismaError(exception: DatabaseException): {
    detail: string;
    status: HttpStatus;
    title: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          detail: 'A record with this value already exists',
          status: HttpStatus.CONFLICT,
          title: 'Duplicate Entry',
        };
      case 'P2003':
        return {
          detail: 'Related record does not exist or cannot be used',
          status: HttpStatus.BAD_REQUEST,
          title: 'Invalid Relationship',
        };
      case 'P2025':
        return {
          detail: 'The requested record was not found',
          status: HttpStatus.NOT_FOUND,
          title: 'Record Not Found',
        };
      default:
        return {
          detail:
            typeof exception.message === 'string'
              ? exception.message
              : 'Database operation failed',
          status: HttpStatus.BAD_REQUEST,
          title:
            typeof exception.name === 'string'
              ? exception.name
              : 'Database Error',
        };
    }
  }
}
