import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import 'express';

declare global {
  namespace Express {
    interface Request {
      context?: IRequestContext;
      selectedModel?: ModelDocument;
      user?: AuthenticatedUser;
    }
  }
}
