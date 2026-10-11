import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { runWithRequestPrincipal } from '@api/authorization/brand-access/request-principal.context';
import { toWorkflowSchedulePrincipal } from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

type PrincipalRequest = Request & { user?: AuthenticatedUser };

/**
 * Binds the guard-authenticated user or API key as the request's principal, so a deep
 * authorization seam (such as the breakout publication fence) can tell who is scheduling
 * without every entry point threading the identity through.
 */
@Injectable()
export class RequestPrincipalInterceptor implements NestInterceptor {
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const user = executionContext
      .switchToHttp()
      .getRequest<PrincipalRequest>().user;
    const principal =
      user && (user.userId || user.id) && user.organizationId
        ? toWorkflowSchedulePrincipal(user)
        : undefined;
    const observable = next.handle();

    return new Observable<unknown>((subscriber) =>
      runWithRequestPrincipal(principal, () => {
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
