import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@server/common/interfaces/request-context.interface';
import 'express';

declare global {
  namespace Express {
    interface Request {
      context?: IRequestContext;
      user?: AuthenticatedUser;
    }
  }
}
