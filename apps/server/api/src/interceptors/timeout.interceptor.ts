import { REQUEST_TIMEOUT_MS } from '@api/helpers/decorators/request-timeout/request-timeout.decorator';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const override = handler
      ? this.reflector.get<number>(REQUEST_TIMEOUT_MS, handler)
      : undefined;
    const timeoutMs =
      typeof override === 'number' && Number.isFinite(override) && override > 0
        ? override
        : 30_000;
    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(new RequestTimeoutException());
        }

        return throwError(error);
      }),
    );
  }
}
