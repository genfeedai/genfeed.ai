import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

type TenantContextRequest = Request & {
  context?: Pick<IRequestContext, 'organizationId'>;
  user?: AuthenticatedUser;
};

function readRequestOrganizationId(
  request: TenantContextRequest,
): string | undefined {
  const fromContext = request.context?.organizationId?.trim();
  if (fromContext) {
    return fromContext;
  }

  const fromMetadata = request.user?.organizationId?.trim();
  return fromMetadata || undefined;
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = executionContext
      .switchToHttp()
      .getRequest<TenantContextRequest>();
    const organizationId = readRequestOrganizationId(request);
    const observable = next.handle();

    if (!organizationId) {
      return observable;
    }

    return new Observable<unknown>((subscriber) =>
      runWithTenantContext({ organizationId }, () => {
        const subscription = observable.subscribe({
          complete: () => subscriber.complete(),
          error: (error: unknown) => subscriber.error(error),
          next: (value: unknown) => subscriber.next(value),
        });
        return () => subscription.unsubscribe();
      }),
    );
  }
}
