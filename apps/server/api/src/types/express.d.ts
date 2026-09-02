import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import 'express';

declare global {
  namespace Express {
    interface Request {
      context?: IRequestContext;
      user?: AuthenticatedUser;
    }
  }
}
