import type { User } from '@clerk/backend';
import 'express';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';

declare global {
  namespace Express {
    interface Request {
      context?: IRequestContext;
      user?: User;
    }
  }
}
