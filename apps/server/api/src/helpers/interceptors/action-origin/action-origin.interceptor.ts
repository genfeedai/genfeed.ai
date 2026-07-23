import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ActionOrigin, MCP_ACTION_ORIGIN_PROOF_HEADER } from '@genfeedai/enums';
import { normalizeActionOrigin, runWithActionOrigin } from '@genfeedai/server';
import { ConfigService } from '@libs/config/config.service';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

type ActionOriginRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class ActionOriginInterceptor implements NestInterceptor {
  constructor(private readonly configService: ConfigService) {}

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = executionContext
      .switchToHttp()
      .getRequest<ActionOriginRequest>();
    const metadata = request.user?.publicMetadata;
    const context = {
      ...(metadata?.apiKeyId ? { apiKeyId: metadata.apiKeyId } : {}),
      ...(metadata?.user ? { actorUserId: metadata.user } : {}),
      origin: this.resolveOrigin(request, metadata),
    };
    const observable = next.handle();

    return new Observable<unknown>((subscriber) =>
      runWithActionOrigin(context, () => {
        const subscription = observable.subscribe({
          complete: () => subscriber.complete(),
          error: (error: unknown) => subscriber.error(error),
          next: (value: unknown) => subscriber.next(value),
        });
        return () => subscription.unsubscribe();
      }),
    );
  }

  private resolveOrigin(
    request: ActionOriginRequest,
    metadata: AuthenticatedUser['publicMetadata'],
  ): ActionOrigin {
    if (this.hasTrustedMcpOriginProof(request)) {
      return ActionOrigin.MCP;
    }

    if (metadata?.isApiKey === true) {
      const storedOrigin = normalizeActionOrigin(metadata.actionOrigin);
      return storedOrigin === ActionOrigin.CLI ||
        storedOrigin === ActionOrigin.MCP ||
        storedOrigin === ActionOrigin.UI
        ? storedOrigin
        : ActionOrigin.API;
    }

    return ActionOrigin.UI;
  }

  private hasTrustedMcpOriginProof(request: ActionOriginRequest): boolean {
    const configured = this.configService.get('GENFEEDAI_API_KEY');
    const supplied = request.headers[MCP_ACTION_ORIGIN_PROOF_HEADER];
    const expected =
      typeof configured === 'string' && configured.length > 0
        ? createHash('sha256').update(configured).digest('base64url')
        : '';
    if (
      !expected ||
      typeof supplied !== 'string' ||
      expected.length !== supplied.length
    ) {
      return false;
    }

    return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  }
}
