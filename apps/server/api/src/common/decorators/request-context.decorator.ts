import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const RequestContext = createParamDecorator(
  (field: keyof IRequestContext | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<RequestWithContext>();
    if (!req.context) {
      return undefined;
    }
    return field ? req.context[field] : req.context;
  },
);
